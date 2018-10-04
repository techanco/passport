var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

//追加モジュール
var mongoose = require('mongoose');
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var bodyParser = require('body-parser');
var session = require('express-session');

const User = require('./models/user');
const accountUser = require('./models/account_user');
const accountGroup = require('./models/account_group');

// MongoDB
mongoose.connect("mongodb://localhost/book-store");

User.find({}, function (err, docs) {
  if (!err) {
    console.log("num of item => " + docs.length)
    for (var i = 0; i < docs.length; i++) {
      console.log(docs[i]);
    }
    //mongoose.disconnect()  // mongodbへの接続を切断
    //process.exit()         // node.js終了
  } else {
    console.log("find error")
  }
});

passport.use(new LocalStrategy(
  function (username, password, done) {
    accountUser.findOne({ "name": username }, function (err, user) {
      if (err) { return done(err); }
      if (!user) {
        return done(null, false, { message: 'ユーザーIDが間違っています。' });
      }
      if (!user.validPassword(password)) {
        return done(null, false, { message: 'パスワードが間違っています。' });
      }
      //var passwordHash = util.getPasswordHash(password);
      //if (!user || user.password_hash != passwordHash) {
      //  return done(null, false, request.flash("message", "ユーザー名とパスワードが一致しません。"));
      //}
      return done(null, user);
    });
  }
));

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {  // 認証済
    return next();
  }
  else {  // 認証されていない
    res.redirect('/login');  // ログイン画面に遷移
  }
}

// ルーティング設定
app.get('/', isAuthenticated, function (req, res) {
  res.render('index');
});

app.get('/login', function (req, res) {
  res.render('login');
});

app.use(bodyParser.urlencoded({ extended: true }));

app.post('/login',
  passport.authenticate('local', {
    successRedirect: '/',
    failureRedirect: '/login',
    failureFlash: true
  })
);

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
