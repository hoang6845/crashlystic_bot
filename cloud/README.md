# Chạy miễn phí: GitHub Actions + Cloudflare Worker

Bản cloud chạy Chrome trên GitHub Actions. Cloudflare Worker Free chỉ nhận lệnh Slack và kích hoạt workflow. D1 Free giữ dấu yêu cầu và giới hạn lượt chạy thủ công. Không dùng Cloudflare Containers, không cần Docker, và máy cá nhân có thể tắt sau khi kiểm tra thành công.

Repo phải là **private**. Phiên Firebase được mã hóa AES-256-GCM; chỉ file mã hóa được commit, khóa giải mã đặt trong GitHub Actions Secrets. Khi phiên hết hạn, cần đăng nhập và xuất lại trên máy. Chuyển phiên Google sang runner có thể bị Google yêu cầu xác minh; cần kiểm tra thực tế trước khi tắt bản local. Google Sheets service account chỉ cấp quyền ghi Sheet, không thay thế phiên Firebase Console.

## 1. Xuất phiên Firebase trên máy

Nếu app nền đang chạy, vào Task Scheduler và Stop task `FirebaseCrashReportDaily`. Đóng Chrome dùng profile của app để tránh tranh chấp profile.

Tại thư mục dự án:

```powershell
npm ci
npm run login:cloud
```

Chrome bình thường mở profile riêng, không dùng Playwright trong lúc đăng nhập. Đăng nhập Google, mở trang Crashlytics của Cute Keyboard và kiểm tra thấy các chỉ số. **Đóng tất cả cửa sổ Chrome của profile app**, quay lại PowerShell và nhấn Enter. Sau đó script mở lại Chrome bình thường với cùng profile để đọc phiên đã lưu và xuất file mã hóa. Không đóng cửa sổ thứ hai; script tự đóng sau khi xuất.

Chương trình tạo:

- `cloud/auth/firebase-state.enc`: phiên đã mã hóa, được phép commit vào repo private.
- `.runtime/cloud-session-key.txt`: khóa giải mã, đã được gitignore. Chỉ sao chép nội dung vào GitHub secret `FIREBASE_SESSION_KEY`.

Không gửi khóa, cookie hoặc JSON service account vào chat. Không upload `browser-profile/`, `.runtime/`, hay `credentials/` lên Git. Không dùng GitHub cache/artifacts để lưu phiên đăng nhập. Chạy lại `login:cloud` sẽ dùng lại khóa hiện có; nếu khóa đã bị mất, chương trình tạo khóa mới và bạn cần cập nhật GitHub secret.


### Google báo “This browser or app may not be secure”

Luồng đăng nhập đã đổi sang Chrome bình thường, không có Playwright hoặc remote debugging khi bạn nhập tài khoản. Dừng app nền, đóng cửa sổ Chrome của lần chạy cũ rồi chạy lại `npm run login:cloud`. Sau khi đăng nhập và mở được Crashlytics, đóng toàn bộ cửa sổ Chrome của profile app trước khi nhấn Enter trong PowerShell.

Nếu vẫn bị từ chối, cập nhật Google Chrome và thử đăng nhập trong Chrome thông thường để kiểm tra tài khoản; tài khoản tổ chức có thể cần quản trị viên kiểm tra chính sách. Không tắt bảo mật tài khoản hoặc cố đăng nhập trong cửa sổ tự động. Xem [hướng dẫn của Google](https://support.google.com/accounts/answer/7675428?hl=en-US).

## 2. Đưa code lên GitHub private

Dùng repo private hiện có hoặc tạo repo private mới. File workflow phải nằm trên default branch; trong cấu hình Worker dùng đúng tên branch, thường là `main`.

Sau khi xuất phiên, đưa các file thay đổi lên repo:

```powershell
git add .github/workflows/daily-report.yml run-report.js package.json package-lock.json scripts cloud .gitignore README.md
git diff --cached --stat
git commit -m "Add free cloud Crashlytics reporting"
git push
```

Kiểm tra danh sách trước khi commit. Không commit file chứa secrets. Hướng dẫn này không tự thay remote Git hoặc tạo repo. Nếu repo mới chưa có code, cần đưa các file nguồn còn lại của dự án lên repo trước.

Workflow cloud thay workflow cũ, chạy lịch `30 1 * * *` = **08:30 giờ Việt Nam**. Lịch GitHub có thể bắt đầu trễ. Không giữ thêm workflow khác gửi cùng báo cáo.

## 3. Điền GitHub Actions Secrets và Variables

Trong repo: **Settings → Secrets and variables → Actions**.

Tab **Secrets**, tạo:

| Tên | Giá trị |
| --- | --- |
| `FIREBASE_SESSION_KEY` | Nội dung `.runtime/cloud-session-key.txt` |
| `GOOGLE_CREDENTIALS_JSON` | Toàn bộ JSON service account của Google Sheets |
| `SPREADSHEET_ID` | ID Sheet đích |
| `SLACK_WEBHOOK_URL` | URL lấy từ Slack Incoming Webhooks; xem mục 3.1 bên dưới |

Sheet phải được share với `client_email` trong Google JSON, quyền Editor.

Tab **Variables**, tạo:

| Tên | Giá trị |
| --- | --- |
| `CLOUD_REPORT_ENABLED` | `true` |
| `SHEET_NAME` | `crashlystic` hoặc tên tab của bạn |

Workflow chưa chạy khi `CLOUD_REPORT_ENABLED` không bằng `true`. Hãy thêm secrets trước khi bật biến này.

### 3.1. Tạo Slack Incoming Webhook và lấy `SLACK_WEBHOOK_URL`

1. Mở [Slack Apps](https://api.slack.com/apps), đăng nhập workspace sẽ nhận báo cáo. Nếu đã có app **Crashlytics Daily** dùng cho bản local, mở app đó; nếu chưa có, chọn **Create New App**, chọn cách tạo app trống (không dùng manifest), đặt tên **Crashlytics Daily** và chọn workspace.
2. Trong trang cấu hình app, vào **Incoming Webhooks**, bật **Activate Incoming Webhooks**.
3. Bấm **Add New Webhook to Workspace**, chọn kênh nhận báo cáo (ví dụ `#crash-reports`), rồi bấm **Allow**. Nếu chọn kênh private, tài khoản đang cài app phải là thành viên kênh đó. Nếu workspace yêu cầu phê duyệt app, nhờ quản trị viên phê duyệt trước.
4. Quay lại **Incoming Webhooks**, trong bảng **Webhook URLs for Your Workspace**, bấm **Copy** ở dòng kênh vừa chọn. URL có dạng `https://hooks.slack.com/services/...`; sao chép toàn bộ URL.
5. Mở repo GitHub → **Settings → Secrets and variables → Actions → Secrets → New repository secret**. Điền **Name** là `SLACK_WEBHOOK_URL`, dán URL vào **Secret**, rồi bấm **Add secret**. Nếu secret đã có, bấm sửa để cập nhật giá trị.
6. Sau khi điền đủ các secrets còn lại và bật variable `CLOUD_REPORT_ENABLED=true`, chạy workflow theo bước 4 bên dưới. Báo cáo sẽ được gửi vào kênh gắn với webhook.

Nếu đã có webhook hoạt động trên máy, có thể dùng lại giá trị `SLACK_WEBHOOK_URL` trong `.env` và bắt đầu từ bước 5. File `.env` trên máy không tự được chuyển lên GitHub Actions, nên vẫn phải tạo repository secret.

Webhook gắn với kênh đã chọn. Muốn đổi kênh, tạo webhook mới rồi cập nhật secret `SLACK_WEBHOOK_URL`. Giữ URL trong secret, không commit vào Git hay gửi vào chat.

Chỉ nhận báo cáo hằng ngày thì hoàn tất phần Incoming Webhooks là đủ. Nếu muốn gõ `/crash-report` khi máy tắt, làm tiếp phần Cloudflare Worker và Slack command ở các bước 5–8.

Hướng dẫn chính thức: [Slack Incoming Webhooks](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/).

### 3.2. Ghi thêm vào Sheet Crash-free Tracking

Workflow đã có đích mặc định là Sheet `1uz7VkvtZwHjk16luXoW66olcMtSZmG-Vp45xRimaOYU`, tab `gid=555656315`. Share Sheet mới cho `client_email` trong `GOOGLE_CREDENTIALS_JSON` với quyền **Editor**, đồng thời giữ cấu hình Sheet cũ.

Mỗi lần chạy tự tìm app ở cột B và ngày đầy đủ ở hàng 2, ghi Crash-Free Users vào ô có sẵn; chỉ chèn cột ngày khi chưa có. Xem [chi tiết bố cục và cách đổi đích](../README.md#ghi-thêm-vào-sheet-crash-free-tracking). Không cần thêm secret cho Sheet mới; có thể đổi đích bằng GitHub Variables `TRACKING_SPREADSHEET_ID` và `TRACKING_SHEET_ID`.

## 4. Chạy thử GitHub trước

Trong **Actions → Daily Crash Report → Run workflow**, chọn default branch và chạy. Lần này thực sự lấy số liệu, ghi Sheet và gửi Slack.

Kiểm tra run màu xanh, cột ngày trên Sheet và tin nhắn Slack. Nếu báo thiếu chỉ số hoặc session expired, chạy lại `npm run login:cloud`, commit và push file `.enc` mới; cập nhật secret khóa nếu khóa thay đổi. Workflow không tự đăng nhập Google và không tự lưu phiên đã cập nhật qua mỗi lần chạy.

Mỗi run giới hạn **15 phút**, gồm cả cài dependencies/Chromium. Khi lỗi bình thường, bot cố gửi thông báo lỗi chung vào kênh webhook; nếu job timeout hoặc bị hủy, thông báo lỗi có thể không gửi được. Xem Actions để biết kết quả chính xác. Không upload credentials hoặc browser profile làm artifact.

Nếu chỉ cần báo cáo hằng ngày, có thể dừng ở đây: **không cần Cloudflare hoặc Slack command**.

## 5. Tạo Worker Free và D1 Free để nhận lệnh

Trong PowerShell:

```powershell
cd cloud\worker
npm ci
npx wrangler login
npx wrangler d1 create crashlytics-requests
```

Lệnh cuối tạo database D1. Sao chép `database_id` được trả về vào `d1_databases[0].database_id` trong `wrangler.jsonc`, thay ID toàn số 0.

Điền các biến trong `wrangler.jsonc`:

| Biến | Nội dung |
| --- | --- |
| `GITHUB_OWNER` | Tài khoản hoặc tổ chức sở hữu repo |
| `GITHUB_REPO` | Chỉ tên repo, không có URL hoặc owner |
| `GITHUB_REF` | Default branch chứa code và workflow, ví dụ `main` |
| `SLACK_TEAM_ID` | ID workspace, dạng `T...`, thường thấy trong URL `app.slack.com/client/T...` |
| `SLACK_ALLOWED_USER_IDS` | ID thành viên được phép dùng lệnh, phân cách bằng dấu phẩy; đặt `*` để cho phép mọi thành viên trong workspace `SLACK_TEAM_ID` |
| `MAX_MANUAL_REPORTS_PER_DAY` | Mặc định `2`, tính theo ngày UTC |
| `CLOUD_REPORT_ENABLED` | Đổi thành `true` sau khi GitHub chạy thử thành công |

Để lấy ID người dùng Slack: mở profile người dùng → menu ba chấm → **Copy member ID**. Không để nguyên các giá trị `YOUR_...`.

Khởi tạo bảng D1 trên cloud:

```powershell
npx wrangler d1 execute crashlytics-requests --remote --file=schema.sql
```

## 6. Tạo GitHub token cho Worker

GitHub: **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.

- Resource owner: owner của repo.
- Repository access: **Only select repositories**, chọn đúng repo private.
- Repository permissions: **Actions → Read and write**.
- Đặt ngày hết hạn; cập nhật Worker secret khi token hết hạn.
- Nếu repo thuộc tổ chức, có thể cần tổ chức phê duyệt token.

Worker chỉ dùng token để gọi `workflow_dispatch`; token không cần quyền sửa code repo. Lưu token trực tiếp khi Wrangler hỏi:

```powershell
npx wrangler secret put GITHUB_TOKEN
```

## 7. Điền Slack Signing Secret và deploy

Trong Slack app đang dùng: **Basic Information → App Credentials → Signing Secret**. Tại thư mục `cloud/worker`:

```powershell
npx wrangler secret put SLACK_SIGNING_SECRET
npm run check
npm run deploy
```

Giữ tài khoản Cloudflare ở **Workers Free**, dùng D1 Free; không bật Containers hay nâng Workers Paid cho luồng này. URL Worker xuất hiện sau deploy, ví dụ:

```text
https://crashlytics-slack.<subdomain>.workers.dev
```

Mở `/health` để kiểm tra Worker có phản hồi. Endpoint này chỉ kiểm tra Worker sống, không xác nhận đủ secrets hoặc GitHub/Firebase hoạt động.

## 8. Chuyển Slack command từ Socket Mode sang HTTP

Sau khi Worker được deploy:

1. Trong Slack app, vào **Socket Mode**, tắt **Enable Socket Mode**.
2. Vào **Slash Commands**, tạo hoặc sửa `/crash-report`.
3. Request URL: `https://crashlytics-slack.<subdomain>.workers.dev/slack/commands`.
4. Short Description: `Lấy báo cáo Crashlytics ngay`; Save.
5. Kiểm tra bot scope **commands** và cài/Reinstall to Workspace nếu Slack yêu cầu.
6. Gõ `/crash-report` trong kênh bằng người dùng nằm trong allowlist.

Worker trả lời riêng ngay, rồi thông báo riêng khi GitHub nhận yêu cầu. Báo cáo cuối cùng gửi vào **kênh gắn với Incoming Webhook**, dù gọi lệnh ở kênh khác. Không gửi response URL hay user token Slack vào GitHub workflow. Bản cloud không cần `SLACK_APP_TOKEN`.

D1 chặn gửi lại cùng yêu cầu và giới hạn mặc định hai yêu cầu thủ công mỗi ngày UTC. Một lần dispatch lỗi cũng tính vào giới hạn để tránh gửi trùng khi GitHub đã nhận nhưng trả lời bị timeout. Kiểm tra GitHub runs trước khi thử lại. GitHub chạy tối đa một báo cáo trong concurrency group; yêu cầu có thể phải chờ hoặc bị GitHub thay thế khi đã có nhiều run pending.

Lệnh thủ công và lịch hằng ngày độc lập: chạy thủ công không hủy báo cáo theo lịch. Cả hai có thể gửi trong cùng ngày.

## 9. Tắt bản local và giữ trong hạn mức miễn phí

Chỉ tắt local sau khi GitHub chạy thử và Slack command đã hoạt động. Tại thư mục gốc dự án:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/schedule-task.ps1 -Action Unregister
```

Nếu tiến trình local còn chạy, Stop task trước khi Unregister. Sau đó máy cá nhân có thể tắt; chỉ cần mở lại để cập nhật phiên Google khi hết hạn.

GitHub Free có **2.000 phút/tháng** cho private repo, dùng chung với các workflow khác trong tài khoản. Dùng runner Linux tiêu chuẩn như workflow này; không dùng larger runner. Một lịch mỗi ngày + tối đa hai lệnh thủ công/ngày, mỗi run tối đa 15 phút, tương đương khoảng **1.395 phút/31 ngày** nếu mọi run chạm timeout; rerun từ UI, workflow khác và thay đổi cấu hình có thể tăng mức sử dụng. Đây không phải cơ chế tự đo/chặn tổng quota tài khoản.

Trong GitHub **Settings → Billing & licensing → Budgets and alerts**, kiểm tra ngân sách Actions và bật **Stop usage when budget limit is reached** cho phần trả phí theo giao diện tài khoản. Giữ spending limit ở 0 nếu giao diện hỗ trợ; không bật chi trả vượt hạn mức. Đừng coi timeout/giới hạn hai lệnh là bảo đảm hóa đơn bằng 0 nếu tài khoản đã cho phép trả phí. Kiểm tra usage định kỳ.

Cloudflare Worker và D1 dùng Free plan. Khi vượt quota Free, yêu cầu có thể bị từ chối; không nâng Paid nếu muốn giữ miễn phí.

## Kiểm tra code

Từ thư mục gốc:

```powershell
npm test
node --check run-report.js
cd cloud\worker
npm ci
npm run check
npx wrangler d1 execute crashlytics-requests --local --file=schema.sql
```

Các kiểm thử không gửi Slack hay truy cập Firebase. `npm run check` chỉ bundle dry-run, không deploy. Cần cấu hình tài khoản và chạy thử thật để xác nhận Google chấp nhận phiên cloud.

Tài liệu chính thức: [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [Workflow dispatch](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [Slack request signing](https://docs.slack.dev/authentication/verifying-requests-from-slack/), [Playwright authentication](https://playwright.dev/docs/auth).


cd C:\go-tools-browser-crawl-ahido\cloud\worker
npm run deploy