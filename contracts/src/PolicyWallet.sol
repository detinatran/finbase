// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title PolicyWallet — the on-chain "leash" for an AI wallet agent.
/// @notice Funds live in this contract. Two roles:
///   - owner    : the human. Full control, sets policy, approves escalations.
///   - operator : the AI agent's hot key. Can ONLY move enabled tokens to
///                allowlisted, already-active recipients, within per-tx and
///                daily limits. It cannot approve, call arbitrary contracts,
///                change policy, or unpause.
///   Anything outside the operator's envelope must go through
///   requestTransfer() and wait for the owner. This is Layer 3 of the
///   defence-in-depth design: it holds even if the LLM and the off-chain
///   policy engine are both fully compromised.
contract PolicyWallet {
    // ---------------------------------------------------------------- types

    struct TokenPolicy {
        bool enabled;
        uint128 perTxLimit;
        uint128 dailyLimit;
    }

    enum RequestStatus {
        Pending,
        Executed,
        Rejected
    }

    struct Request {
        address token;
        address to;
        uint256 amount;
        uint64 createdAt;
        RequestStatus status;
        string memo;
    }

    // ---------------------------------------------------------------- state

    /// @dev address(0) is used as the token address for native ETH.
    address public constant NATIVE = address(0);

    address public owner;
    address public operator;
    bool public paused;

    /// @notice Seconds before a newly allowlisted recipient becomes usable by
    ///         the operator. Gives the owner a window to notice a malicious
    ///         allowlist change (e.g. a phished owner session).
    uint64 public recipientDelay;

    mapping(address token => TokenPolicy) public tokenPolicy;
    /// @notice 0 = not allowlisted; otherwise the timestamp it becomes active.
    mapping(address recipient => uint64) public recipientActiveAt;
    mapping(address token => mapping(uint256 day => uint256)) public spentPerDay;

    Request[] internal _requests;

    uint256 private _lock = 1;

    // --------------------------------------------------------------- errors

    error NotOwner();
    error NotOperator();
    error NotOwnerOrOperator();
    error WalletPaused();
    error ZeroAddress();
    error ZeroAmount();
    error TokenNotAllowed(address token);
    error RecipientNotAllowed(address recipient);
    error RecipientNotYetActive(address recipient, uint64 activeAt);
    error ExceedsPerTxLimit(uint256 amount, uint256 limit);
    error ExceedsDailyLimit(uint256 amount, uint256 remaining);
    error InvalidRequest(uint256 id);
    error TransferFailed();
    error CallFailed(bytes reason);
    error Reentrancy();

    // --------------------------------------------------------------- events

    event TransferExecuted(
        address indexed by, address indexed token, address indexed to, uint256 amount, uint256 requestId, string memo
    );
    event TransferRequested(uint256 indexed id, address indexed token, address indexed to, uint256 amount, string memo);
    event RequestApproved(uint256 indexed id);
    event RequestRejected(uint256 indexed id);
    event RecipientAdded(address indexed recipient, uint64 activeAt);
    event RecipientRemoved(address indexed recipient);
    event TokenPolicySet(address indexed token, bool enabled, uint128 perTxLimit, uint128 dailyLimit);
    event OperatorChanged(address indexed previous, address indexed current);
    event OwnershipTransferred(address indexed previous, address indexed current);
    event RecipientDelaySet(uint64 delay);
    event Paused(address indexed by);
    event Unpaused(address indexed by);
    event OwnerCall(address indexed target, uint256 value, bytes data);

    /// @dev requestId used in TransferExecuted for direct (non-request) transfers.
    uint256 public constant DIRECT = type(uint256).max;

    // ------------------------------------------------------------ modifiers

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert WalletPaused();
        _;
    }

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(address owner_, address operator_, uint64 recipientDelay_) {
        if (owner_ == address(0)) revert ZeroAddress();
        owner = owner_;
        operator = operator_;
        recipientDelay = recipientDelay_;
        emit OwnershipTransferred(address(0), owner_);
        emit OperatorChanged(address(0), operator_);
        emit RecipientDelaySet(recipientDelay_);
    }

    receive() external payable {}

    // ------------------------------------------------------ operator (agent)

    /// @notice Autonomous transfer inside the policy envelope (tier T1).
    function executeTransfer(address token, address to, uint256 amount, string calldata memo)
        external
        onlyOperator
        whenNotPaused
        nonReentrant
    {
        _checkEnvelope(token, to, amount);
        spentPerDay[token][today()] += amount;
        _send(token, to, amount);
        emit TransferExecuted(msg.sender, token, to, amount, DIRECT, memo);
    }

    /// @notice Ask the owner to approve a transfer outside the envelope (tier T2).
    function requestTransfer(address token, address to, uint256 amount, string calldata memo)
        external
        onlyOperator
        whenNotPaused
        returns (uint256 id)
    {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        id = _requests.length;
        _requests.push(Request(token, to, amount, uint64(block.timestamp), RequestStatus.Pending, memo));
        emit TransferRequested(id, token, to, amount, memo);
    }

    // ------------------------------------------------------------- shared

    /// @notice Emergency brake. The agent may pull it (fail-safe), only the owner releases it.
    function pause() external {
        if (msg.sender != owner && msg.sender != operator) revert NotOwnerOrOperator();
        paused = true;
        emit Paused(msg.sender);
    }

    // -------------------------------------------------------------- owner

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function approveRequest(uint256 id) external onlyOwner nonReentrant {
        Request storage r = _pending(id);
        r.status = RequestStatus.Executed;
        _send(r.token, r.to, r.amount);
        emit RequestApproved(id);
        emit TransferExecuted(msg.sender, r.token, r.to, r.amount, id, r.memo);
    }

    function rejectRequest(uint256 id) external onlyOwner {
        Request storage r = _pending(id);
        r.status = RequestStatus.Rejected;
        emit RequestRejected(id);
    }

    function addRecipient(address recipient) external onlyOwner {
        if (recipient == address(0)) revert ZeroAddress();
        uint64 activeAt = uint64(block.timestamp) + recipientDelay;
        recipientActiveAt[recipient] = activeAt;
        emit RecipientAdded(recipient, activeAt);
    }

    function removeRecipient(address recipient) external onlyOwner {
        delete recipientActiveAt[recipient];
        emit RecipientRemoved(recipient);
    }

    function setTokenPolicy(address token, bool enabled, uint128 perTxLimit, uint128 dailyLimit) external onlyOwner {
        tokenPolicy[token] = TokenPolicy(enabled, perTxLimit, dailyLimit);
        emit TokenPolicySet(token, enabled, perTxLimit, dailyLimit);
    }

    function setOperator(address operator_) external onlyOwner {
        emit OperatorChanged(operator, operator_);
        operator = operator_;
    }

    function setRecipientDelay(uint64 delay) external onlyOwner {
        recipientDelay = delay;
        emit RecipientDelaySet(delay);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Owner escape hatch: arbitrary call (e.g. recover tokens, interact with DeFi).
    function ownerExecute(address target, uint256 value, bytes calldata data)
        external
        onlyOwner
        nonReentrant
        returns (bytes memory result)
    {
        bool ok;
        (ok, result) = target.call{value: value}(data);
        if (!ok) revert CallFailed(result);
        emit OwnerCall(target, value, data);
    }

    // -------------------------------------------------------------- views

    function today() public view returns (uint256) {
        return block.timestamp / 1 days;
    }

    function remainingToday(address token) public view returns (uint256) {
        TokenPolicy memory p = tokenPolicy[token];
        uint256 spent = spentPerDay[token][today()];
        return spent >= p.dailyLimit ? 0 : p.dailyLimit - spent;
    }

    function isRecipientActive(address recipient) public view returns (bool) {
        uint64 at = recipientActiveAt[recipient];
        return at != 0 && at <= block.timestamp;
    }

    function requestCount() external view returns (uint256) {
        return _requests.length;
    }

    function getRequest(uint256 id) external view returns (Request memory) {
        if (id >= _requests.length) revert InvalidRequest(id);
        return _requests[id];
    }

    // ----------------------------------------------------------- internal

    function _checkEnvelope(address token, address to, uint256 amount) internal view {
        if (amount == 0) revert ZeroAmount();
        TokenPolicy memory p = tokenPolicy[token];
        if (!p.enabled) revert TokenNotAllowed(token);
        uint64 at = recipientActiveAt[to];
        if (at == 0) revert RecipientNotAllowed(to);
        if (at > block.timestamp) revert RecipientNotYetActive(to, at);
        if (amount > p.perTxLimit) revert ExceedsPerTxLimit(amount, p.perTxLimit);
        uint256 remaining = remainingToday(token);
        if (amount > remaining) revert ExceedsDailyLimit(amount, remaining);
    }

    function _pending(uint256 id) internal view returns (Request storage r) {
        if (id >= _requests.length) revert InvalidRequest(id);
        r = _requests[id];
        if (r.status != RequestStatus.Pending) revert InvalidRequest(id);
    }

    function _send(address token, address to, uint256 amount) internal {
        if (token == NATIVE) {
            (bool ok,) = to.call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            (bool ok, bytes memory ret) = token.call(abi.encodeCall(IERC20Minimal.transfer, (to, amount)));
            if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
        }
    }
}
