# Hướng dẫn nhanh (tiếng Việt, dành cho đội)

## 0. Việc phải làm NGAY
- [ ] Cả đội đăng ký ở **fintechathon.g-ican.com**. Hạn đăng ký và nộp bài chung một mốc: **20/10/2026, 22:59 giờ Việt Nam**.
- [ ] Đội 2 người thì **cả 2 phải không mang quốc tịch Trung Quốc** và đang học full-time ở trường ngoài Trung Quốc.

## 1. Chạy thử trên máy (không cần API key, không cần ETH)
```bash
cd ~/finhackathon
./scripts/dev.sh
```
Mở **http://localhost:3100** (cổng 3000 trên máy bạn đang bị Docker dùng nên app chạy cổng 3100).

Chạy lần lượt các bước sau để nắm luồng demo:
1. Bấm "Pay all the bills in my inbox". Kết quả: 1 khoản tự trả (T1), 2 khoản chờ duyệt (T2), 2 khoản bị chặn (T3: địa chỉ giả mạo và prompt injection).
2. Ở cột phải, mục **Owner approvals**, bấm Approve.
3. Bật **☠️ Simulate compromised agent** rồi gõ bất kỳ. Agent bị "hack" cố chuyển tiền 6 lần và bị chặn cả 6.
4. Mục **Red team**, bấm "Drain to attacker". Lớp 2 bị tắt, giao dịch gửi thẳng lên chain và bị contract **revert**.

## 2. Đổi sang AI thật (tùy chọn)
Sửa `app/.env.local`:
- **Gemini (miễn phí):** `LLM_PROVIDER=openai`, `OPENAI_API_KEY=<key từ aistudio.google.com>`. Kiểm tra lại tên model trong `OPENAI_MODEL` cho khớp model Gemini hiện có.
- **Claude:** `LLM_PROVIDER=anthropic`, `ANTHROPIC_API_KEY=...`

Sau đó tắt rồi chạy lại `npm run dev` trong thư mục `app`.

## 3. Lên testnet để có transaction hash thật (bắt buộc với Topic F)
1. Tạo 2 ví **mới, chỉ dùng cho testnet**:
   ```bash
   ~/.foundry/bin/cast wallet new   # chạy 2 lần: 1 ví owner, 1 ví agent
   ```
2. Xin ETH Base Sepolia cho **ví owner** từ faucet: Coinbase CDP faucet, Alchemy, QuickNode hoặc Superchain faucet. Khoảng 0.01 ETH là đủ. Một số faucet yêu cầu đăng nhập.
3. Deploy và tạo bằng chứng:
   ```bash
   export OWNER_PRIVATE_KEY=0x...      # ví owner đã có ETH
   export OPERATOR_PRIVATE_KEY=0x...   # ví agent
   ./scripts/deploy-base-sepolia.sh
   cd app && npm run evidence          # sinh docs/EXECUTION_EVIDENCE.md kèm link Basescan
   ```
   ⚠️ Đừng bao giờ commit private key. File `.env.local` đã được gitignore.

## 4. Đưa code lên GitHub
```bash
cd ~/finhackathon
git add -A && git commit -m "Leash: AI wallet agent for Shenzhen FinTechathon"
gh repo create leash-fintechathon --public --source=. --push
```

## 5. Hồ sơ nộp (6 mục)
Xem `docs/SUBMISSION_CHECKLIST.md`. Tóm tắt:

| Mục | File |
|---|---|
| Tài liệu kỹ thuật | `docs/TECHNICAL.md` → xuất PDF |
| Slide 10 phút | dựng theo `docs/PITCH_DECK.md` |
| Video ≤ 5 phút | quay theo `docs/DEMO_VIDEO_SCRIPT.md` |
| Source code | link GitHub |
| Báo cáo bảo mật | `docs/SECURITY_SELF_ASSESSMENT.md` → PDF |
| Bằng chứng on-chain | `docs/EXECUTION_EVIDENCE.md` (chạy lại trên Base Sepolia) → PDF |

## 6. Chia việc cho đội 2 người
- **Người kỹ thuật:** chạy testnet, sinh bằng chứng, nắm chắc 3 lớp bảo vệ để trả lời giám khảo (đọc kỹ `TECHNICAL.md` mục 4–5).
- **Người pitch:** dựng slide, quay video, luyện thuyết trình tiếng Anh, chuẩn bị phần Q&A (cuối file `PITCH_DECK.md`).

## 7. Những câu giám khảo hay hỏi
Trong `docs/PITCH_DECK.md`, mục **Q&A prep**. Câu chốt nên thuộc lòng:
> "You can fool the model; you can't fake where a string came from — and even if you could, the contract says no."
