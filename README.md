# Firebase Crashlytics → Google Sheets và Slack

Ứng dụng chạy nền trên Windows, bắt đầu lấy số liệu lúc **08:30 giờ Việt Nam** mỗi ngày. Slack nhận thông báo sau khi lấy dữ liệu và ghi Sheet xong. Nếu mở máy sau 08:30, app chạy bù cho ngày hiện tại. Máy cần bật, có mạng và đăng nhập Windows; app không thể gửi khi máy tắt hoặc ngủ.

## 1. Cấu hình Google Sheet

File `.env` đã có sẵn:

```dotenv
SPREADSHEET_ID=1H38pYnwbn07z8ysCYBoWL7AxU3--q9fFMIAemX4v0vo
SHEET_NAME=crashlystic
SLACK_WEBHOOK_URL=
REPORT_TIME=08:30
```

1. Mở [Google Cloud Console](https://console.cloud.google.com/), chọn hoặc tạo project.
2. Vào **APIs & Services → Library**, bật **Google Sheets API**.
3. Vào **IAM & Admin → Service Accounts → Create service account**. Không cần cấp role Owner/Editor của Cloud project chỉ để ghi Sheet.
4. Mở service account → **Keys → Add key → Create new key → JSON**. Lưu file tải về tại `credentials/service-account.json` trong thư mục dự án; tạo thư mục `credentials` nếu chưa có.
5. Mở JSON, lấy giá trị `client_email`. Mở [Sheet đích](https://docs.google.com/spreadsheets/d/1H38pYnwbn07z8ysCYBoWL7AxU3--q9fFMIAemX4v0vo/edit), bấm **Share**, thêm email đó với quyền **Editor**.
6. Khi chạy báo cáo, app tự tạo tab `crashlystic` nếu chưa có. Mỗi ngày có hai cột Crash-Free Users và Crash-Free Sessions. Chạy lại cùng ngày cập nhật cột ngày đó.

Đổi Sheet sau này bằng `SPREADSHEET_ID` và `SHEET_NAME` trong `.env`, rồi chia sẻ Sheet mới cho cùng service account. Nếu tổ chức không cho tạo JSON key, liên hệ quản trị viên.

Hướng dẫn chính thức: [Tạo service account key](https://docs.cloud.google.com/iam/docs/keys-create-delete).

## 2. Tạo bot thông báo Slack

1. Mở [Slack Apps](https://api.slack.com/apps) → **Create New App → Blank app → Continue**.
2. Đặt tên, ví dụ **Crashlytics Daily**, chọn workspace.
3. Vào **Incoming Webhooks**, bật **Activate Incoming Webhooks**.
4. Bấm **Add New Webhook to Workspace**, chọn kênh nhận báo cáo, rồi **Allow**. Với kênh private, tài khoản cài app phải là thành viên kênh đó.
5. Trong bảng **Webhook URLs for Your Workspace**, bấm **Copy** ở dòng kênh vừa chọn. Sao chép toàn bộ URL dạng `https://hooks.slack.com/services/...` vào `SLACK_WEBHOOK_URL` trong `.env` trên máy. Nếu chạy GitHub Actions, tạo repository secret cùng tên theo [mục 3.1 của hướng dẫn cloud](cloud/README.md#31-tạo-slack-incoming-webhook-và-lấy-slack_webhook_url). Không gửi URL hay JSON key vào chat.

Webhook gắn với kênh đã chọn. Đổi kênh bằng cách tạo webhook mới và cập nhật `.env`. Nếu workspace yêu cầu phê duyệt app, nhờ quản trị viên phê duyệt.

Thông báo gồm ngày, tên từng app, Crash-Free Users, Crash-Free Sessions và link tới cột báo cáo trên Sheet. Không tag toàn bộ kênh. Các giá trị là tỷ lệ **không bị crash**, đúng chỉ số hiện có của ứng dụng.

Hướng dẫn chính thức: [Slack Incoming Webhooks](https://api.slack.com/messaging/webhooks).

## 2.1. Gõ lệnh /crash-report trong Slack (Socket Mode)

Dùng chính Slack app đã tạo ở bước 2. Webhook gửi báo cáo; Socket Mode nhận lệnh. Không cần mở cổng public hay cấu hình Request URL.

1. Vào **Socket Mode**, bật **Enable Socket Mode**.
2. Vào **Basic Information → App-Level Tokens → Generate Token and Scopes**. Đặt tên token, thêm scope **connections:write**, rồi tạo token.
3. Lưu token bắt đầu bằng `xapp-` vào `SLACK_APP_TOKEN` trong `.env` trên máy. Không gửi token vào chat hoặc commit Git.
4. Vào **Slash Commands → Create New Command**: Command **/crash-report**, Short Description **Lấy báo cáo Crashlytics ngay**, rồi Save. Khi bật Socket Mode, không cần Request URL.
5. Trong **OAuth & Permissions → Bot Token Scopes**, kiểm tra có **commands** (thêm nếu chưa có). Cài hoặc **Reinstall to Workspace** để áp dụng quyền mới; nếu workspace yêu cầu, quản trị viên cần phê duyệt.
6. Chạy `npm ci`. Nếu app nền đang chạy, Stop task **FirebaseCrashReportDaily** trong Task Scheduler rồi chạy lại **start-app.bat**. Hoặc dừng bản nền và chạy `npm start` để thử trong terminal. Sau khi đổi app token, cần khởi động lại app.
7. Trong ô soạn tin nhắn của một kênh Slack, gõ **/crash-report** và gửi. Không cần bật Event Subscriptions hay dùng bot token. Người dùng được Slack cho phép dùng lệnh của app đều có thể yêu cầu báo cáo.

App phản hồi riêng ngay khi nhận yêu cầu, sau đó lấy số liệu, ghi Sheet và gửi báo cáo vào **kênh gắn với webhook**, dù bạn gọi lệnh ở kênh khác. Nếu có báo cáo đang chạy (theo lịch hoặc theo lệnh), yêu cầu mới bị từ chối để tránh dùng chung Chrome profile. Yêu cầu Slack gửi lại với cùng trigger ID trong một giờ không chạy lại trong cùng tiến trình.

Lệnh thủ công không đánh dấu đã chạy lịch hôm nay, nên lịch 08:30 vẫn có thể gửi thêm báo cáo. Không chạy `npm run report` đồng thời với app nền: lệnh terminal riêng không dùng khóa của app nền. Thông báo hoàn tất riêng sử dụng response URL của Slack; nếu báo cáo kéo dài quá thời hạn URL (30 phút), kiểm tra báo cáo trong kênh webhook và log.

Máy phải bật, có mạng, không ngủ và app phải đang chạy. Nếu thiếu `SLACK_APP_TOKEN`, lịch hằng ngày vẫn hoạt động nhưng không nhận lệnh. Kiểm tra `run-report.log` có dòng **Slack Socket Mode connected.**; nếu không có, kiểm tra token, Socket Mode, quyền cài app và khởi động lại. Code không tự sửa cấu hình Slack trên workspace.

Hướng dẫn chính thức: [Socket Mode](https://docs.slack.dev/apis/events-api/using-socket-mode/) và [Slash Commands](https://docs.slack.dev/interactivity/implementing-slash-commands/).

## 3. Đăng nhập Firebase và chạy thử

Cần Node.js 20 trở lên và Google Chrome. Trong PowerShell tại thư mục dự án:

```powershell
npm ci
npm run login
```

Chrome sẽ mở profile riêng của app. Đăng nhập tài khoản được cấp quyền xem Firebase, kiểm tra truy cập các project cần lấy số liệu rồi đóng tất cả cửa sổ Chrome của profile app và nhấn Enter trong PowerShell. Nếu app nền đã chạy, dừng task `FirebaseCrashReportDaily` trong Task Scheduler trước khi đăng nhập lại để tránh dùng chung profile.

Danh sách lấy báo cáo nằm ở `APPS` trong `run-report.js`. Hiện chỉ **Cute Keyboard** được bật; bỏ comment các app cần thêm. URL Cute Keyboard đang lọc phiên bản 1.6.1 (134) và 1.6.0 (131).

Sau khi điền webhook và cấu hình quyền Sheet:

```powershell
npm run report
```

Lệnh này thực sự ghi Sheet và gửi Slack. Nó là chạy thủ công, không đánh dấu đã chạy lịch hôm nay; nếu sau đó khởi động app nền sau 08:30, app có thể gửi thêm một báo cáo theo lịch.

## 4. Tự khởi động cùng Windows

Nhấp đúp **start-app.bat** sau khi hoàn tất cấu hình. File này đăng ký task `FirebaseCrashReportDaily` cho tài khoản Windows hiện tại và chạy app nền ngay. Những lần sau, app tự chạy khi bạn đăng nhập Windows. Nếu hệ thống từ chối quyền đăng ký task, chạy file bằng **Run as administrator** với cùng tài khoản Windows.

App kiểm tra lịch mỗi 30 giây theo múi giờ `Asia/Ho_Chi_Minh`, đọc lại `.env` mỗi lần kiểm tra và không phụ thuộc múi giờ Windows. Giữ thư mục dự án ở vị trí hiện tại; nếu di chuyển, chạy lại `start-app.bat` tại vị trí mới.

- Log: `run-report.log`.
- Trạng thái ngày chạy: `.runtime/daily.json` (`running`, `success`, `failed`).
- Mỗi ngày tự chạy tối đa một lần, kể cả khi khởi động lại app. Khi báo cáo lỗi hoặc bị ngắt, app không tự thử lại trong ngày đó để tránh gửi trùng; sửa lỗi rồi chạy `npm run report` thủ công. Ngày hôm sau lịch tiếp tục bình thường.
- Nếu thiếu `.env`, webhook hoặc JSON key, app ghi log và chờ cấu hình, chưa đánh dấu ngày đã chạy.
- App dùng cổng loopback `127.0.0.1:47831` để tránh mở hai bản cùng lúc.
- Không chạy đồng thời một bản báo cáo trên GitHub Actions nếu muốn tránh thông báo trùng; workflow cũ trong repo là một lịch độc lập.

Xem trạng thái hoặc gỡ startup:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/schedule-task.ps1 -Action Status
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/schedule-task.ps1 -Action Unregister
```

Các file `.env`, `credentials/`, `browser-profile/`, `.runtime/` và log đã được loại khỏi Git bằng `.gitignore`.

## Kiểm tra mã

```powershell
npm test
node --check app.js
node --check run-report.js
```

Kiểm thử lịch không kết nối Google hay gửi Slack. Kiểm thử toàn bộ luồng cần hoàn tất thông tin đăng nhập trên máy.

## Chạy cloud miễn phí, không cần bật máy

Đã có bản **GitHub Actions + Cloudflare Worker Free + D1 Free**. Xem [hướng dẫn từng bước](cloud/README.md): xuất phiên Firebase mã hóa bằng `npm run login:cloud`, cấu hình GitHub secrets, chạy thử workflow rồi triển khai Worker nhận `/crash-report` qua HTTP.

Workflow cloud mặc định chưa chạy cho đến khi GitHub variable `CLOUD_REPORT_ENABLED=true`. Chỉ chọn một nơi chạy lịch để tránh gửi trùng; sau khi cloud hoạt động, dừng/gỡ task local. Bản cloud dùng Request URL, cần tắt Socket Mode trong Slack app. Miễn phí trong hạn mức của GitHub và Cloudflare; kiểm tra giới hạn chi trả và usage của tài khoản theo hướng dẫn.