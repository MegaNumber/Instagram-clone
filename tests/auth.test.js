// مسیر فایل: /tests/auth.test.js
// نسخه: 1.0.0
// توضیح: تست یکپارچگی مسیرهای احراز هویت (ثبت‌نام و ورود)
// این فایل با استفاده از Supertest، Express Router واقعی auth را بارگذاری کرده و
// کنترلرها و میدلورها را mock می‌کند تا رفتار endpointها بدون اتصال واقعی به دیتابیس بررسی شود.
//
// پیش‌نیاز اجرای موفق تست‌ها:
// - نصب jest و supertest (در devDependencies)
// - صادرات app از index.js یا در دسترس بودن ماژول‌های مسیر (routes/auth)

const request = require('supertest');
const express = require('express');
const rateLimit = require('express-rate-limit');

// Mock کردن میدلور requireAuth (در صورت نیاز در مسیرهای دیگر)
jest.mock('../controllers/authController', () => ({
  requireAuth: (req, res, next) => next(),
  optionalAuth: (req, res, next) => next(),
}));

// Mock کردن asyncHandler – تابع واقعی آن بسیار ساده است، اما برای احتیاط
jest.mock('../utils/asyncHandler', () => (fn) => (req, res, next) => fn(req, res, next).catch(next));

// Mock کردن کنترلرهای ثبت‌نام و ورود
jest.mock('../controllers/authController', () => {
  const originalModule = jest.requireActual('../controllers/authController');
  return {
    ...originalModule,
    register: jest.fn(),
    login: jest.fn(),
  };
});

// بارگذاری Router واقعی (توجه: کنترلرهای mock شده استفاده می‌شوند)
const authRouter = require('../routes/auth');

// ایجاد یک برنامه Express کوچک برای تست مسیرها
const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);

// اضافه کردن مدیریت خطای مرکزی (مطابق با پروژه) برای تست پاسخ‌های 500
app.use((err, req, res, next) => {
  res.status(500).json({ success: false, error: 'خطای سرور' });
});

describe('آزمون‌های مسیرهای احراز هویت', () => {
  let registerMock, loginMock;

  beforeEach(() => {
    jest.clearAllMocks();
    registerMock = require('../controllers/authController').register;
    loginMock = require('../controllers/authController').login;
  });

  // ==================== تست‌های POST /api/auth/register ====================
  describe('POST /api/auth/register', () => {
    it('باید با ورودی معتبر کاربر جدید ثبت‌نام کند و توکن بازگرداند', async () => {
      const userData = {
        fullname: 'علی رضایی',
        username: 'alireza',
        email: 'ali@example.com',
        password: '12345678',
        confirmPassword: '12345678',
      };

      registerMock.mockImplementation((req, res) => {
        res.status(201).json({
          success: true,
          token: 'fake-jwt-token',
          user: { id: 'user123', username: 'alireza' },
        });
      });

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect('Content-Type', /json/)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.token).toBeDefined();
      expect(registerMock).toHaveBeenCalledTimes(1);
    });

    it('باید با ورودی فاقد نام کاربری خطای 400 برگرداند', async () => {
      const invalidData = {
        fullname: 'علی',
        username: '',
        email: 'ali@example.com',
        password: '12345678',
        confirmPassword: '12345678',
      };

      // کنترلر واقعی توسط express-validator بررسی می‌شود، بنابراین نیازی به mock خطا نداریم
      const response = await request(app)
        .post('/api/auth/register')
        .send(invalidData)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
      expect(registerMock).not.toHaveBeenCalled();
    });

    it('باید با ایمیل نامعتبر خطای 400 برگرداند', async () => {
      const invalidEmail = {
        fullname: 'علی',
        username: 'alireza',
        email: 'invalid-email',
        password: '12345678',
        confirmPassword: '12345678',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(invalidEmail)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(registerMock).not.toHaveBeenCalled();
    });

    it('باید با رمز عبور کمتر از 8 کاراکتر خطای 400 برگرداند', async () => {
      const shortPassword = {
        fullname: 'علی',
        username: 'alireza',
        email: 'ali@example.com',
        password: '123',
        confirmPassword: '123',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(shortPassword)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('باید با عدم تطابق رمز و تأییدیه خطای 400 برگرداند', async () => {
      const mismatch = {
        fullname: 'علی',
        username: 'alireza',
        email: 'ali@example.com',
        password: '12345678',
        confirmPassword: '87654321',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(mismatch)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    // تست محدودیت نرخ: ممکن است پیچیده باشد، اینجا به‌عنوان ساختار بعدی ثبت می‌کنیم
  });

  // ==================== تست‌های POST /api/auth/login ====================
  describe('POST /api/auth/login', () => {
    it('باید با نام کاربری و رمز درست توکن برگرداند', async () => {
      const credentials = {
        login: 'alireza',
        password: '12345678',
      };

      loginMock.mockImplementation((req, res) => {
        res.status(200).json({
          success: true,
          token: 'fake-jwt-token',
          user: { username: 'alireza' },
        });
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send(credentials)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.token).toBeDefined();
      expect(loginMock).toHaveBeenCalledTimes(1);
    });

    it('باید با نام کاربری غلط خطای 401 برگرداند (شبیه‌سازی توسط کنترلر)', async () => {
      const wrongCredentials = {
        login: 'unknown',
        password: '12345678',
      };

      loginMock.mockImplementation((req, res) => {
        res.status(401).json({
          success: false,
          error: 'نام کاربری یا رمز عبور اشتباه است',
        });
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send(wrongCredentials)
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('باید با فیلد خالی login خطای 400 برگرداند', async () => {
      const missingLogin = { login: '', password: '12345678' };

      const response = await request(app)
        .post('/api/auth/login')
        .send(missingLogin)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(loginMock).not.toHaveBeenCalled();
    });

    it('باید با فیلد خالی password خطای 400 برگرداند', async () => {
      const missingPass = { login: 'alireza', password: '' };

      const response = await request(app)
        .post('/api/auth/login')
        .send(missingPass)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });
});
