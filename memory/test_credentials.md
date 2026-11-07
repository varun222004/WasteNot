# Test Credentials

Auth is passwordless email OTP. In this preview DEV_OTP_ENABLED=true, so after "Send code" the 6-digit code is shown on the login screen (data-testid="dev-otp-code") and returned as `dev_otp` from POST /api/v1/auth/request-otp.

- Admin: varshini.v2204@gmail.com (in ADMIN_EMAILS → role admin on sign-in)
- Any other email signs up as a normal member (e.g. TEST_giver@example.com, TEST_taker@example.com)
- Rate limits: 30s cooldown between code requests per email, 5 codes/hour per email, 5 verify attempts per code.
- Demo seed members (no login needed): demo.ananya@wastenot.dev, demo.karthik@wastenot.dev, demo.meera@wastenot.dev
