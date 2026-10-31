/**
 * Study Tracker – backend (Google Apps Script web app).
 * Nhận báo cáo từ web app, rồi: lưu ảnh vào Drive, ghi 1 dòng vào Google Sheet, gửi email.
 * Hướng dẫn cài đặt: xem README.md.
 */

// ===== SỬA 3 DÒNG NÀY =====
const RECIPIENT_EMAIL = 'your-email@gmail.com'; // email nhận báo cáo
const SECRET_TOKEN = 'doi-chuoi-bi-mat-nay'; // phải trùng SECRET_TOKEN trong js/config.js
const SHEET_ID = '1OstG2YXboD7UEUZopB9dnlcwyyh236cNfa2JQa-9irc'; // ID của Google Sheet (đoạn giữa /d/ và /edit trong URL)
// ==========================

const SHEET_NAME = 'Nhật ký';
const DRIVE_ROOT_FOLDER = 'Study Tracker';
const TIMEZONE = 'Asia/Ho_Chi_Minh';

const MAX_IMAGES_PER_TASK = 3;
const MAX_IMAGES_TOTAL = 12;
const MAX_IMAGE_BASE64_LENGTH = 4 * 1024 * 1024; // ~3MB ảnh sau khi giải mã
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

function doGet() {
  return jsonResponse({ ok: true, message: 'Study Tracker backend is running.' });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const data = JSON.parse(e.postData.contents);
    validate(data);
    lock.waitLock(20000);

    const dateVN = data.date.split('-').reverse().join('/');
    const doneTasks = data.tasks.filter((t) => t.done);
    const missedTasks = data.tasks.filter((t) => !t.done);

    const saved = saveImages(data, doneTasks); // [{ taskTitle, link, blob }]
    appendRow(data, dateVN, doneTasks, missedTasks, saved);
    sendMail(data, dateVN, doneTasks, missedTasks, saved);

    return jsonResponse({ ok: true });
  } catch (err) {
    console.error(err);
    return jsonResponse({ ok: false, error: String(err.message || err) });
  } finally {
    try {
      lock.releaseLock();
    } catch (e2) {}
  }
}

function validate(data) {
  if (!data || data.token !== SECRET_TOKEN) throw new Error('Sai token.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date || '')) throw new Error('Ngày không hợp lệ.');
  if (!Array.isArray(data.tasks) || !data.tasks.length || data.tasks.length > 20) {
    throw new Error('Danh sách task không hợp lệ.');
  }
  let total = 0;
  data.tasks.forEach((t) => {
    const imgs = t.images || [];
    if (imgs.length > MAX_IMAGES_PER_TASK) throw new Error('Quá nhiều ảnh cho một task.');
    total += imgs.length;
    imgs.forEach((img) => {
      if (ALLOWED_MIME.indexOf(img.mime) === -1) throw new Error('Định dạng ảnh không được hỗ trợ.');
      if (!img.data || img.data.length > MAX_IMAGE_BASE64_LENGTH) throw new Error('Ảnh quá lớn.');
    });
  });
  if (total > MAX_IMAGES_TOTAL) throw new Error('Quá nhiều ảnh.');
}

function saveImages(data, doneTasks) {
  const result = [];
  const withImages = doneTasks.filter((t) => (t.images || []).length);
  if (!withImages.length) return result;

  const dayFolder = getOrCreateFolder(getOrCreateFolder(DriveApp.getRootFolder(), DRIVE_ROOT_FOLDER), data.date);
  withImages.forEach((task) => {
    task.images.forEach((img, i) => {
      const ext = img.mime.split('/')[1].replace('jpeg', 'jpg');
      const name = safeName(task.id) + '_' + (i + 1) + '.' + ext;
      const blob = Utilities.newBlob(Utilities.base64Decode(img.data), img.mime, name);
      const file = dayFolder.createFile(blob);
      try {
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (e) {
        // Tài khoản Workspace có thể chặn chia sẻ công khai; link vẫn mở được với chủ sở hữu.
      }
      result.push({ taskTitle: task.title, link: file.getUrl(), blob: blob });
    });
  });
  return result;
}

function appendRow(data, dateVN, doneTasks, missedTasks, saved) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  const headers = [
    'Ngày', 'Thứ', 'Đã làm', 'Chưa làm', 'Kiến thức mới', 'Khó khăn', 'Cần giải đáp', 'Link ảnh', 'Thời gian gửi',
  ];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#d9f3f6');
    sheet.setFrozenRows(1);
  }
  const row = [
    dateVN,
    data.weekday,
    bulletList(doneTasks) || '—',
    bulletList(missedTasks) || '—',
    data.learned,
    data.difficulties,
    data.questions,
    saved.map((s) => s.link).join('\n'),
    Utilities.formatDate(new Date(), TIMEZONE, 'dd/MM/yyyy HH:mm'),
  ];
  const target = sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length);
  target.setNumberFormat('@'); // lưu dạng text: không bị đổi thành ngày/công thức
  target.setValues([row]);
  target.setWrap(true).setVerticalAlignment('top');
}

function sendMail(data, dateVN, doneTasks, missedTasks, saved) {
  const subject = 'Task đã làm ' + data.weekday + ', ngày ' + dateVN;

  const photosByTask = {};
  saved.forEach((s) => {
    (photosByTask[s.taskTitle] = photosByTask[s.taskTitle] || []).push(s.link);
  });
  const doneHtml = doneTasks.length
    ? '<ul>' +
      doneTasks
        .map((t) => {
          const links = (photosByTask[t.title] || [])
            .map((l, i) => ' <a href="' + esc(l) + '">[ảnh ' + (i + 1) + ']</a>')
            .join('');
          return '<li>' + esc(t.title) + links + '</li>';
        })
        .join('') +
      '</ul>'
    : '<p>—</p>';
  const missedHtml = missedTasks.length
    ? '<ul>' + missedTasks.map((t) => '<li>' + esc(t.title) + '</li>').join('') + '</ul>'
    : '<p>Không có – đã làm đủ tất cả task.</p>';

  const section = (title, body) =>
    '<h3 style="color:#0c8693;margin:18px 0 6px">' + title + '</h3>' + body;
  const paragraph = (text) => '<p style="margin:0;white-space:pre-wrap">' + esc(text) + '</p>';

  const htmlBody =
    '<div style="font-family:Arial,sans-serif;font-size:15px;color:#16363d;max-width:600px">' +
    (data.student ? '<p>Học sinh: <b>' + esc(data.student) + '</b></p>' : '') +
    section('Hôm nay đã làm', doneHtml) +
    section('Chưa làm', missedHtml) +
    section('Học được gì mới', paragraph(data.learned)) +
    section('Có khó khăn', paragraph(data.difficulties)) +
    section('Cần giải đáp', paragraph(data.questions)) +
    (saved.length ? '<p style="color:#5d7f87;margin-top:18px">Ảnh minh chứng được đính kèm trong email này.</p>' : '') +
    '</div>';

  MailApp.sendEmail({
    to: RECIPIENT_EMAIL,
    subject: subject,
    htmlBody: htmlBody,
    body: subject, // fallback dạng text
    name: 'Study Tracker',
    attachments: saved.map((s) => s.blob),
  });
}

// ---------- helpers ----------
function bulletList(tasks) {
  return tasks.map((t) => '• ' + t.title).join('\n');
}

function getOrCreateFolder(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function safeName(s) {
  return String(s).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
