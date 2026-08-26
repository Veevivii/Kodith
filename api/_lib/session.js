// iron-session config, shared by every auth/admin route.
//
// `ttl` (seconds) is the one place session length is set — iron-session
// derives the cookie's max-age from it automatically (ttl - 60s), so it does
// NOT belong in cookieOptions too; setting it there as well would just be
// redundant with what iron-session already manages.
const SEVEN_DAYS = 60 * 60 * 24 * 7;

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error("SESSION_SECRET must be set and at least 32 characters long");
}

export const sessionOptions = {
  cookieName: "kodith_admin_session",
  password: process.env.SESSION_SECRET,
  ttl: SEVEN_DAYS,
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  },
};
