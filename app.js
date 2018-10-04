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

var passport = require('passport')
  , LocalStrategy = require('passport-local').Strategy;

passport.use(new LocalStrategy(
  function (username, password, done) {
    User.findOne({ username: username }, function (err, user) {
      if (err) { return done(err); }
      if (!user) {
        return done(null, false, { message: 'ユーザーIDが正しくありません。' });
      }
      if (!user.validPassword(password)) {
        return done(null, false, { message: 'パスワードが正しくありません。' });
      }
      return done(null, user);
    });
  }
));

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
app.get('/login', function (req, res) {
  res.render('login');
});

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
