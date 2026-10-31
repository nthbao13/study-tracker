// Lịch học theo thứ. Key = Date.getDay() (0 = Chủ nhật, 1 = Thứ 2, ... 6 = Thứ 7).
// Muốn đổi lịch chỉ cần sửa file này. Mỗi task: { id, title, duration, note }.
// `id` phải duy nhất trong cùng một ngày.

const WEEKDAY_NAMES = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

const HOMEWORK = { id: 'homework', title: 'Làm bài tập về nhà (BTVN)', duration: '', note: '' };

const DICTATION = {
  id: 'english-dictation',
  title: 'Tiếng Anh – Dictation',
  duration: '20 phút',
  note: '',
};

const LITERATURE = {
  id: 'literature',
  title: 'Học Văn',
  duration: '60 – 90 phút',
  note: 'Đọc bài và soạn dàn ý.',
};

const SCHEDULE = {
  0: [HOMEWORK],
  1: [
    HOMEWORK,
    { id: 'math-practice', title: 'Học Toán – làm đề', duration: '90 phút', note: 'Làm đề.' },
    LITERATURE,
  ],
  2: [HOMEWORK, LITERATURE, DICTATION],
  3: [
    HOMEWORK,
    DICTATION,
    {
      id: 'math-review',
      title: 'Toán – xem lại phần làm sai',
      duration: '40 phút',
      note: 'Xem lại những câu làm sai trong đề hôm thứ 2.',
    },
  ],
  4: [HOMEWORK, DICTATION, LITERATURE],
  5: [
    HOMEWORK,
    { id: 'math-practice', title: 'Toán – làm đề', duration: '90 phút', note: '' },
    DICTATION,
  ],
  6: [
    {
      id: 'math-review',
      title: 'Toán – xem lại phần làm sai',
      duration: '',
      note: 'Xem lại những câu làm sai trong đề hôm thứ 6.',
    },
    DICTATION,
    LITERATURE,
  ],
};
