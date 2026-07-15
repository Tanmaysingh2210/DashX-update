import passport from "passport";
import { Strategy } from "passport-github2";
import User from "../models/User.js";

passport.use(
  new Strategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: process.env.GITHUB_CALLBACK_URL,
      scope: ["user:email"], // we only need basic profile + email
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // profile.id     → GitHub's numeric user ID (stable, never changes)
        // profile.username → GitHub login handle e.g. "tanmay-sketch"
        // profile.emails  → array of email objects
        // profile.photos  → array of avatar objects

        const githubId = profile.id;
        const githubUsername = profile.username;
        const avatar = profile.photos?.[0]?.value || null;
        const email = profile.emails?.[0]?.value || null;

        // find existing user by githubId (not username — username can change)
        let user = await User.findOne({ githubId });

        if (user) {
          // user exists — update fields that may have changed
          user.githubUsername = githubUsername;
          user.avatar = avatar;
          user.email = email;
          await user.save();
        } else {
          // first time login — create new user
          user = await User.create({
            githubId,
            githubUsername,
            avatar,
            email,
          });
        }

        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

// not using passport sessions — we issue our own JWT
// these are required by passport even if unused
passport.serializeUser((user, done) => done(null, user._id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

export default passport;