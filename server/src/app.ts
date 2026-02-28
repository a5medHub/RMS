import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import session from "express-session";
import { env, isProduction } from "./config/env.js";
import { passport } from "./config/passport.js";
import { authRouter } from "./routes/auth.js";
import { recipeRouter } from "./routes/recipes.js";
import { pantryRouter } from "./routes/pantry.js";
import { aiRouter } from "./routes/ai.js";
import { notificationRouter } from "./routes/notifications.js";
import { errorHandler, notFound } from "./middleware/error.js";

export const app = express();

app.set("trust proxy", 1);
app.use(helmet());
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  }),
);
app.use(morgan("dev"));
app.use(express.json({ limit: "1mb" }));
app.use(
  session({
    name: "rms.sid",
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  }),
);
app.use(passport.initialize());
app.use(passport.session());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);
app.use("/api/recipes", recipeRouter);
app.use("/api/pantry", pantryRouter);
app.use("/api/ai", aiRouter);
app.use("/api/notifications", notificationRouter);

app.use(notFound);
app.use(errorHandler);

