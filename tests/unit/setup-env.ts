// Integration tests talk to TEST_DATABASE_URL only (never .env.local).
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.DATABASE_URL_UNPOOLED = process.env.TEST_DATABASE_URL;
}
process.env.APP_BASE_URL ??= "https://app.jaljeevika.org";
process.env.STORAGE_DRIVER = "database";
process.env.EMAIL_PROVIDER = "none";
