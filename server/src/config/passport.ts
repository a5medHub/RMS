import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { prisma } from "./db.js";
import { env } from "./env.js";

const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

if (googleEnabled) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${env.SERVER_URL}/api/auth/google/callback`,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;

          if (!email) {
            return done(new Error("Google profile did not include an email."));
          }

          const user = await prisma.user.upsert({
            where: { email },
            update: {
              name: profile.displayName || email,
              avatarUrl: profile.photos?.[0]?.value,
              googleId: profile.id,
            },
            create: {
              email,
              name: profile.displayName || email,
              avatarUrl: profile.photos?.[0]?.value,
              googleId: profile.id,
            },
          });

          done(null, user);
        } catch (error) {
          done(error as Error);
        }
      },
    ),
  );
}

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });

    if (!user) {
      return done(null, false);
    }

    done(null, user);
  } catch (error) {
    done(error as Error);
  }
});

export { googleEnabled, passport };

