# Study Tracker

Web app to-do list học tập theo ngày (HTML/CSS/JS thuần, không cần build). Khi học sinh bấm **Gửi báo cáo**, app gửi email cho bạn, ghi một dòng vào Google Sheet và lưu ảnh minh chứng vào Google Drive. Backend là một **Google Apps Script** miễn phí chạy trong tài khoản Google của bạn.

## Cấu trúc

```
index.html, css/style.css       giao diện
js/schedule.js                  lịch học 7 ngày (sửa file này khi đổi lịch)
js/config.js                    URL + token của Apps Script
js/app.js                       logic
apps-script/Code.gs             backend, copy vào script.google.com
```

## Cài đặt

### 1. Tạo Google Sheet và Apps Script
1. Tạo một Google Sheet mới (tên tùy ý). Copy **ID** của sheet: đoạn nằm giữa `/d/` và `/edit` trong URL.
2. Trong sheet: **Extensions → Apps Script**. Xóa code mẫu, dán toàn bộ nội dung [apps-script/Code.gs](apps-script/Code.gs).
3. Sửa 3 dòng ở đầu file:
   - `RECIPIENT_EMAIL`: email sẽ nhận báo cáo
   - `SECRET_TOKEN`: một chuỗi bí mật bất kỳ
   - `SHEET_ID`: ID vừa copy

### 2. Deploy
1. **Deploy → New deployment → loại Web app**.
2. *Execute as*: **Me**. *Who has access*: **Anyone**.
3. Bấm Deploy, cấp quyền khi Google hỏi (Gmail, Drive, Sheets). Nếu thấy màn hình “Google hasn’t verified this app” thì chọn **Advanced → Go to … (unsafe)**; đây là script của chính bạn.
4. Copy **Web app URL** (dạng `https://script.google.com/macros/s/.../exec`).

> Mỗi lần sửa `Code.gs`, phải **Deploy → Manage deployments → Edit → Version: New version** thì thay đổi mới có hiệu lực.

### 3. Cấu hình frontend
Sửa [js/config.js](js/config.js):

```js
const APP_CONFIG = {
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/.../exec',
  SECRET_TOKEN: 'cùng chuỗi bí mật ở trên',
};
```

### 4. Đưa lên GitHub Pages
Push code lên GitHub → **Settings → Pages → Deploy from a branch → main / (root)**.

## Chạy thử ở máy

```sh
python3 -m http.server 8000
# mở http://localhost:8000
```

- Thêm `?day=0` … `?day=6` vào URL để xem lịch của từng ngày (0 = Chủ nhật).
- Khi `APPS_SCRIPT_URL` còn trống, app chạy **chế độ demo**: bấm gửi chỉ in dữ liệu ra console, không gửi gì.
- Dữ liệu đã tick và nội dung đang soạn được lưu trong trình duyệt theo ngày. Xóa bằng cách xóa site data của trang.

## Kết quả nhận được

- **Email**: tiêu đề `Task đã làm Thứ X, ngày dd/mm/yyyy`; nội dung gồm đã làm / chưa làm / học được gì mới / khó khăn / cần giải đáp; ảnh được đính kèm.
- **Google Sheet** (tab “Nhật ký”): Ngày, Thứ, Đã làm, Chưa làm, Kiến thức mới, Khó khăn, Cần giải đáp, Link ảnh, Thời gian gửi.
- **Google Drive**: thư mục `Study Tracker/<yyyy-MM-dd>` chứa ảnh.

## Lưu ý

- URL Apps Script nằm trong code public nên về lý thuyết ai cũng gọi được. `SECRET_TOKEN` chỉ cản người lạ tình cờ, không phải bảo mật tuyệt đối. Email nhận báo cáo thì không lộ vì chỉ nằm trong script.
- Mỗi ảnh được thu nhỏ (cạnh dài ≤ 1280px) trước khi gửi; tối đa 3 ảnh mỗi task.
- Tài khoản Gmail thường gửi được khoảng 100 email mỗi ngày, quá đủ cho việc này.
