// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PolicyWallet} from "../src/PolicyWallet.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

contract PolicyWalletTest is Test {
    PolicyWallet wallet;
    MockERC20 usdc;
    MockERC20 other;

    address owner = address(0xA11CE);
    address agent = address(0xA9E47);
    address landlord = address(0x1A4D);
    address university = address(0x0B1);
    address attacker = address(0xBAD);

    uint128 constant PER_TX = 500e6;
    uint128 constant DAILY = 1_000e6;

    function setUp() public {
        vm.warp(1_760_000_000);
        wallet = new PolicyWallet(owner, agent, 0);
        usdc = new MockERC20("USD Coin (Test)", "USDC", 6);
        other = new MockERC20("Other", "OTH", 18);
        usdc.mint(address(wallet), 10_000e6);
        other.mint(address(wallet), 1e24);
        vm.deal(address(wallet), 10 ether);

        vm.startPrank(owner);
        wallet.setTokenPolicy(address(usdc), true, PER_TX, DAILY);
        wallet.setTokenPolicy(address(0), true, 0.05 ether, 0.1 ether);
        wallet.addRecipient(landlord);
        wallet.addRecipient(university);
        vm.stopPrank();
    }

    // ------------------------------------------------------------ T1 happy path

    function test_operatorTransfersWithinEnvelope() public {
        vm.prank(agent);
        wallet.executeTransfer(address(usdc), landlord, 300e6, "rent");
        assertEq(usdc.balanceOf(landlord), 300e6);
        assertEq(wallet.remainingToday(address(usdc)), DAILY - 300e6);
    }

    function test_operatorTransfersEthWithinEnvelope() public {
        vm.prank(agent);
        wallet.executeTransfer(address(0), landlord, 0.05 ether, "eth");
        assertEq(landlord.balance, 0.05 ether);
    }

    function test_dailyLimitResetsNextDay() public {
        vm.startPrank(agent);
        wallet.executeTransfer(address(usdc), landlord, 500e6, "a");
        wallet.executeTransfer(address(usdc), landlord, 500e6, "b");
        vm.expectRevert(abi.encodeWithSelector(PolicyWallet.ExceedsDailyLimit.selector, 1e6, 0));
        wallet.executeTransfer(address(usdc), landlord, 1e6, "c");
        vm.warp(block.timestamp + 1 days);
        wallet.executeTransfer(address(usdc), landlord, 500e6, "d");
        vm.stopPrank();
        assertEq(usdc.balanceOf(landlord), 1_500e6);
    }

    // ------------------------------------------------- Layer-3 attack surface

    function test_revert_drainToUnlistedRecipient() public {
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(PolicyWallet.RecipientNotAllowed.selector, attacker));
        wallet.executeTransfer(address(usdc), attacker, 100e6, "airdrop claim");
    }

    function test_revert_overPerTxLimit() public {
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(PolicyWallet.ExceedsPerTxLimit.selector, 501e6, PER_TX));
        wallet.executeTransfer(address(usdc), landlord, 501e6, "too much");
    }

    function test_revert_tokenNotEnabled() public {
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(PolicyWallet.TokenNotAllowed.selector, address(other)));
        wallet.executeTransfer(address(other), landlord, 1, "x");
    }

    function test_revert_strangerCannotOperate() public {
        vm.prank(attacker);
        vm.expectRevert(PolicyWallet.NotOperator.selector);
        wallet.executeTransfer(address(usdc), landlord, 1e6, "x");
    }

    function test_revert_operatorCannotChangePolicy() public {
        vm.startPrank(agent);
        vm.expectRevert(PolicyWallet.NotOwner.selector);
        wallet.setTokenPolicy(address(usdc), true, type(uint128).max, type(uint128).max);
        vm.expectRevert(PolicyWallet.NotOwner.selector);
        wallet.addRecipient(attacker);
        vm.expectRevert(PolicyWallet.NotOwner.selector);
        wallet.setOperator(attacker);
        vm.expectRevert(PolicyWallet.NotOwner.selector);
        wallet.ownerExecute(address(usdc), 0, abi.encodeCall(MockERC20.approve, (attacker, type(uint256).max)));
        vm.expectRevert(PolicyWallet.NotOwner.selector);
        wallet.approveRequest(0);
        vm.stopPrank();
    }

    function test_revert_operatorCannotApproveItsOwnRequest() public {
        vm.prank(agent);
        uint256 id = wallet.requestTransfer(address(usdc), attacker, 9_000e6, "please");
        vm.prank(agent);
        vm.expectRevert(PolicyWallet.NotOwner.selector);
        wallet.approveRequest(id);
        assertEq(usdc.balanceOf(attacker), 0);
    }

    function test_recipientDelayBlocksFreshAllowlistEntry() public {
        vm.prank(owner);
        wallet.setRecipientDelay(1 days);
        vm.prank(owner);
        wallet.addRecipient(attacker);
        uint64 activeAt = uint64(block.timestamp + 1 days);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(PolicyWallet.RecipientNotYetActive.selector, attacker, activeAt));
        wallet.executeTransfer(address(usdc), attacker, 1e6, "x");
        // owner notices and removes it within the window
        vm.prank(owner);
        wallet.removeRecipient(attacker);
        vm.warp(block.timestamp + 2 days);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(PolicyWallet.RecipientNotAllowed.selector, attacker));
        wallet.executeTransfer(address(usdc), attacker, 1e6, "x");
    }

    // ------------------------------------------------------------- pause

    function test_agentCanPauseButNotUnpause() public {
        vm.prank(agent);
        wallet.pause();
        assertTrue(wallet.paused());

        vm.prank(agent);
        vm.expectRevert(PolicyWallet.WalletPaused.selector);
        wallet.executeTransfer(address(usdc), landlord, 1e6, "x");

        vm.prank(agent);
        vm.expectRevert(PolicyWallet.NotOwner.selector);
        wallet.unpause();

        vm.prank(owner);
        wallet.unpause();
        vm.prank(agent);
        wallet.executeTransfer(address(usdc), landlord, 1e6, "x");
    }

    function test_revert_strangerCannotPause() public {
        vm.prank(attacker);
        vm.expectRevert(PolicyWallet.NotOwnerOrOperator.selector);
        wallet.pause();
    }

    // ------------------------------------------------- T2 request lifecycle

    function test_requestApproveFlow() public {
        vm.prank(agent);
        uint256 id = wallet.requestTransfer(address(usdc), university, 2_000e6, "tuition");
        PolicyWallet.Request memory r = wallet.getRequest(id);
        assertEq(uint8(r.status), uint8(PolicyWallet.RequestStatus.Pending));

        vm.prank(owner);
        wallet.approveRequest(id);
        assertEq(usdc.balanceOf(university), 2_000e6);
        // owner-approved transfers do not consume the agent's daily budget
        assertEq(wallet.remainingToday(address(usdc)), DAILY);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(PolicyWallet.InvalidRequest.selector, id));
        wallet.approveRequest(id); // no double execution
    }

    function test_requestRejectFlow() public {
        vm.prank(agent);
        uint256 id = wallet.requestTransfer(address(usdc), attacker, 5_000e6, "suspicious");
        vm.prank(owner);
        wallet.rejectRequest(id);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(PolicyWallet.InvalidRequest.selector, id));
        wallet.approveRequest(id);
        assertEq(usdc.balanceOf(attacker), 0);
    }

    function test_ownerEscapeHatch() public {
        vm.prank(owner);
        wallet.ownerExecute(address(usdc), 0, abi.encodeCall(MockERC20.transfer, (owner, 1_000e6)));
        assertEq(usdc.balanceOf(owner), 1_000e6);
    }

    // ------------------------------------------------------------ fuzzing

    /// @notice Whatever sequence of amounts a compromised agent tries in one day,
    ///         total outflow never exceeds the daily limit.
    function testFuzz_compromisedAgentNeverExceedsDailyLimit(uint256[8] memory amounts, uint8 recipientSeed)
        public
    {
        uint256 before = usdc.balanceOf(address(wallet));
        for (uint256 i = 0; i < amounts.length; i++) {
            address to = (uint256(recipientSeed) + i) % 3 == 0 ? attacker : landlord;
            vm.prank(agent);
            try wallet.executeTransfer(address(usdc), to, amounts[i] % 2_000e6, "fuzz") {} catch {}
        }
        uint256 outflow = before - usdc.balanceOf(address(wallet));
        assertLe(outflow, DAILY);
        assertEq(usdc.balanceOf(attacker), 0);
    }

    /// @notice Over many days the agent can move at most DAILY per day.
    function testFuzz_outflowBoundedOverDays(uint8 days_) public {
        uint256 d = bound(days_, 1, 9);
        for (uint256 i = 0; i < d; i++) {
            vm.startPrank(agent);
            for (uint256 j = 0; j < 4; j++) {
                try wallet.executeTransfer(address(usdc), landlord, PER_TX, "loop") {} catch {}
            }
            vm.stopPrank();
            vm.warp(block.timestamp + 1 days);
        }
        assertLe(usdc.balanceOf(landlord), d * DAILY);
    }
}
