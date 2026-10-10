Bạn làm theo thứ tự: cài Docker trên máy hiện tại, build/check, rồi chuyển máy hoặc deploy Railway.

1. Windows: mở PowerShell Administrator, chạy wsl --install nếu chưa có WSL; khởi động lại khi được yêu cầu. Chạy wsl --update và wsl --version. Cài Docker Desktop từ https://docs.docker.com/desktop/setup/install/windows-install/ và chọn WSL 2 / Linux containers. Mở Docker Desktop, đợi engine chạy. Mở PowerShell mới, chạy docker version, docker compose version và docker run --rm hello-world.

2. Tại C:\go-tools-browser-crawl-ahido:
   node docker/make-env.js
   docker compose -f docker/compose.yml build
   docker compose -f docker/compose.yml run --rm report
   Lệnh make-env đọc cấu hình local và tạo docker/report.env ở check mode.
   File đã tồn tại thì giữ nguyên, hoặc dùng node docker/make-env.js --force khi muốn cập nhật phiên từ local. Không gửi file này vào chat/Git.

3. Cần thấy CHECK PASSED và Validated login saved. Chạy check lại ngay, sau vài giờ và ngày sau. Check không ghi Sheets/Slack. Bản cũ tiếp tục chạy. Không dùng docker compose down -v vì xóa phiên. Không coi check trên Windows là chứng nhận phiên trên Railway.

4. Chạy đầy đủ khi muốn gửi báo cáo thử:
   docker compose -f docker/compose.yml run --rm -e DOCKER_REPORT_MODE=report report
   Lệnh này ghi Sheet và gửi Slack thật. Docker chạy một lượt rồi thoát, không tự tạo lịch trên máy cá nhân.

5. Máy khác: cài Docker Desktop (Windows/macOS) hoặc Docker Engine + Compose (Linux) theo hướng dẫn Docker chính thức. Chuyển source qua repo hoặc file nén, bỏ node_modules, browser-profile, credentials, .runtime và .env. Chuyển riêng docker/report.env qua kênh riêng tư nếu muốn seed bằng cùng phiên. Build lại, chạy check như trên. Volume mới bắt đầu từ seed, không phải profile cập nhật của máy đầu. Google có thể yêu cầu login lại trên môi trường mới.

6. Có thể chuyển image thay vì build source:
   docker build -f docker/Dockerfile -t crashlytics-railway:local .
   docker save -o crashlytics-railway.tar crashlytics-railway:local
   Máy nhận cùng kiến trúc CPU:
   docker load -i crashlytics-railway.tar
   docker volume create firebase-profile
   docker run --rm --env-file docker/report.env --mount source=firebase-profile,target=/data --shm-size=256m crashlytics-railway:local
   Image không chứa secrets/profile. Khác kiến trúc CPU thì nên build từ source.

7. Railway: push docker/ và .gitignore, giữ lịch cũ trong thời gian check.
   New Project → GitHub repo. Root Directory = gốc repo.
   Variables: RAILWAY_DOCKERFILE_PATH=docker/Dockerfile; DOCKER_REPORT_MODE=check; SPREADSHEET_ID; SHEET_NAME; SLACK_WEBHOOK_URL; GOOGLE_CREDENTIALS_JSON; FIREBASE_SESSION_ENCRYPTED; FIREBASE_SESSION_KEY. Hai biến TRACKING_* là tùy chọn như bản cũ.
   Gắn Volume /data. Start Command = node docker/run.js.
   Restart Policy = Never. Không HTTP healthcheck/domain.
   Cron = 0 1 * * * (08:00 Việt Nam/Bangkok).
   Deploy, đọc logs, dùng Run now để check lại; kiểm tra RAM/volume/usage và lượt chạy ngày sau.
   Không chọn Dockerfile gốc (bản Go cũ).
   Railway cron docs: https://docs.railway.com/cron-jobs
   Railway volumes docs: https://docs.railway.com/volumes/reference

8. Sau khi xác nhận Railway hoạt động qua ngày: đặt mode report, tắt lịch GitHub bằng CLOUD_REPORT_ENABLED=false để tránh hai báo cáo daily, dừng lịch local nếu đang dùng. Chưa sửa Cloudflare: lệnh Slack hiện tại vẫn gọi GitHub. Muốn chuyển lệnh Slack cần sửa riêng.
   Rollback: mode check/dừng cron Railway, bật lại lịch cũ. Code cũ vẫn nguyên. Source backup: backups/pre-railway-2026-10-08 (không chứa secrets).

9. Lỗi thường gặp:
   docker không được nhận: mở PowerShell mới sau cài.
   Cannot connect daemon: mở Docker Desktop, đợi engine.
   Virtualization disabled: bật virtualization trong BIOS/UEFI.
   Missing file khi make-env: cấu hình local credentials, hoặc npm run login:cloud như trước.
   Session expired: kiểm tra Volume vẫn gắn tại /data và có latest-session.enc sau lần check thành công. Khi khởi động lại, app khôi phục cookie phiên còn thiếu từ bản sao mã hóa, giữ nguyên cookie mới hơn trong profile. Không xóa volume để thử sửa lỗi. Nếu Google đã từ chối phiên, cần xuất seed mới bằng npm run login:cloud và cập nhật FIREBASE_SESSION_ENCRYPTED cùng khóa tương ứng. Docker không bảo đảm giữ login mãi, chưa có UI đăng nhập trực tiếp trong container.
   Exit 137/OOM: đo RAM, 512 MB chưa được kiểm chứng.
   Exit 73: container khác đang dùng profile, chờ lượt đó kết thúc.

Kiểm thử hồi quy Docker bao gồm khôi phục cookie phiên bị mất sau khi đóng Chromium, giữ cookie đã được làm mới và không khôi phục toàn bộ storage khi profile còn tồn tại. Cần chạy check ngay, sau vài giờ và ngày sau trên server để xác nhận phiên thực tế; kiểm thử mô phỏng không chứng minh Google tiếp tục chấp nhận phiên. Không hứa RAM Free đủ hoặc cookie hoạt động trên server.

