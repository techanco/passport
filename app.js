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
var flash = require("connect-flash");
var session = require('express-session');

const User = require('./models/user');
const accountUser = require('./models/account_user');
const accountGroup = require('./models/account_group');

// MongoDB 接続先設定
mongoose.connect("mongodb://localhost/sample");

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

// passport が ユーザー情報をシリアライズすると呼び出されます
passport.serializeUser(function (id, done) {
  done(null, id);
});

// passport が ユーザー情報をデシリアライズすると呼び出されます
passport.deserializeUser(function (id, done) {
  User.findById(id, (error, user) => {
    if (error) {
      return done(error);
    }
    done(null, user);
  });
});

// passport における具体的な認証処理を設定します。
passport.use(
  "local-login",
  new LocalStrategy({
    usernameField: "username",
    passwordField: "password",
    passReqToCallback: true
  }, function (request, username, password, done) {
    process.nextTick(() => {
      User.findOne({ "email": username }, function (error, user) {
        if (error) {
          console.log("username");
          return done(error);
        }
        if (!user || user.password != password) {
          console.log("password");
          return done(null, false);
        }
        // 保存するデータは必要最低限にする
        console.log("success!");
        return done(null, user._id);
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

function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {  // 認証済
    return next();
  }
  else {  // 認証されていない
    res.redirect('/login');  // ログイン画面に遷移
  }
}

// ルーティング設定
app.get('/', function (req, res) {
  res.render('index');
});

app.get('/login', function (req, res) {
  res.render('login');
});

app.use(bodyParser.urlencoded({ extended: true }));

app.post("/login", passport.authenticate(
  "local-login", {
    successRedirect: "/",
    failureRedirect: "/login"
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
