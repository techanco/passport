var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

//追加 passport LocalStragy mongoose
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var mongoose = require('mongoose');
var session = require('express-session');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

// MongoDB
mongoose.connect("mongodb://localhost/sra_watson");

// // パスワードのハッシュ値を求めるために必要なもの
// var getHash = function(target){
//     var sha = crypto.createHmac("sha256", process.env.PASSWORD_HASH_KEY);
//     sha.update(target);
//     return sha.digest("hex");
// };

passport.serializeUser(function (user, done) {
  done(null, user);
});

passport.deserializeUser(function (user, done) {
  done(null, user);
});

passport.use(
  "local-login",
  new LocalStrategy({
    usernameField: "userName",
    passwordField: "password",
    passReqToCallback: true
  }, function (request, username, password, done) {
    process.nextTick(() => {
      accountUser.findOne({ "user_name": username }, function (error, user) {
        if (error) {
          return done(error);
        }
        var passwordHash = util.getPasswordHash(password);
        if (!user || user.password_hash != passwordHash) {
          return done(null, false, request.flash("message", "ユーザー名とパスワードが一致しません。"));
        }
        // ユーザーに紐づくグループを取得します
        accountGroup.findOne({ "group_id": user.group_id }, function (err, group) {
          if (err || group === null) {
            return done(err);
          } else {
            return done(null, {
              id: user.user_id,
              name: user.user_name,
              display_name: user.display_name,
              role: user.role,
              group_id: user.group_id,
              group: group,
            });
          }
        });
      });
    });
  })
);

// 認可処理。指定されたロールを持っているかどうか判定します。
var authorize = function (role) {
  return function (request, response, next) {
    if (request.isAuthenticated() &&
      request.user.role === role) {
      return next();
    }
    response.redirect("/account/login");
  };
};

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ルーティング設定
app.use("/", (function () {
  var router = express.Router();
  router.get("/home/index", function (request, response) {
    response.render("./home/index.ejs");
  });
  router.get("/account/login", function (request, response) {
    response.render("./account/login.ejs", { message: request.flash("message") });
  });
  router.post("/account/login", passport.authenticate(
    "local-login", {
      successRedirect: "/account/profile",
      failureRedirect: "/account/login"
    }));
  router.post("/account/logout", authorize("group1"), function (request, response) {
    request.logout();
    response.redirect("/home/index");
  });
  router.get("/account/profile", authorize("group1"), function (request, response) {
    response.render("./account/profile.ejs");
  });
  return router;
})());

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
