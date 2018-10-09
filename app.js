var express = require("express");
var cookieParser = require("cookie-parser");
var bodyParser = require("body-parser");
var flash = require("connect-flash");
var session = require("express-session");
var mongoose = require("mongoose");
var passport = require("passport");
var LocalStrategy = require("passport-local").Strategy;

var User = require("./models/user.js");
const accountUser = require('./models/account_user');
const accountGroup = require('./models/account_group');
const Photo = require('./models/photo');
const Steel_tower_master = require('./models/steel_tower_master');

var multer = require('multer');
var upload = multer({
  dest: './public/images',
}).single('thumbnail');
var Jimp = require("jimp");
const gm = require('gm');

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').load();
}

const storage = require('azure-storage');
const blobService = storage.createBlobService();
const containerName = 'srablobtest';

mongoose.connect("mongodb://localhost/sra_watson",
  function (err) {
    if (err) {
      console.log(err);
    } else {
      console.log('connection success!');
    }
  }
);

// ターミナルでMongoDBに保存されているデータを表示する.
/* 

 */

//sessionにユーザー情報を格納する処理
passport.serializeUser(function (user, done) {
  done(null, user);
});

//sessionからユーザ情報を復元する処理
passport.deserializeUser(function (user, done) {
  done(null, user);
});

/**
 * 平文パスワードのハッシュ値を取得します。ハッシュに使用するパスワードは「process.env.PASSWORD_HASH_KEY」です。
 * @param {string} plainPassword 平文パスワード。
 * @return {string} 平文パスワードのハッシュ値。
 */
const crypto = require("crypto");
function getPasswordHash(plainPassword) {
  var sha = crypto.createHmac("sha256", process.env.PASSWORD_HASH_KEY);
  sha.update(plainPassword);
  return sha.digest("hex");
};

//login.ejsのbodyからログイン名とパスワードを取得
//findOneを用いてユーザを検索&認証
passport.use(
  "local-login",
  new LocalStrategy({
    usernameField: "username",
    passwordField: "password",
    passReqToCallback: true
  }, function (request, username, password, done) {
    process.nextTick(() => {
      //DBのUserテーブルからユーザを検索
      accountUser.findOne({ "user_name": username }, function (error, user) {
        if (error) {
          return done(error);
        }
        var passwordHash = getPasswordHash(password);
        if (!user || user.password_hash != passwordHash) {
          return done(null, false, request.flash("message", "Invalid username or password."));
        }
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

//isAuthenticated
/* var authorize = function (role) {
  return function (request, response, next) {
    if (request.isAuthenticated() &&
      request.user.role === role) {
      return next();
    }
    response.redirect("/login");
  };
}; */

// express の実態 Application を生成
var app = express();

// テンプレートエンジンを EJS に設定
app.set("views", "./views");
app.set("view engine", "ejs");

// ミドルウェアの設定
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(flash());
app.use("/public", express.static("public"));

// passport設定
app.use(session({ secret: "some salt", resave: true, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());

//  セッション情報のチェック
/*
var sessionCheck = function (req, res, next) {
  if (req.user.name) {
    next();
  } else {
    res.redirect('/login');
  }
}
*/

// ルーティング設定
app.use("/", (function () {
  var router = express.Router();

  router.get("/", function (request, response) {
    response.render("./index.ejs", {
      session_ID: request.sessionID,
      user_name: request.user.name
    });
  });

  router.get("/login", function (request, response) {
    response.render("./login.ejs", { message: request.flash("message") });
  });

  router.get('/upload', function (req, res, next) {
    res.render('upload', { title: 'BLOB Upload' });
  });

  router.get('/destroy', (request, response) => {
    request.session.destroy((err) => {
      if (err) {
        response.send(err)
        return
      }
      response.redirect('/login')
    })
  });

  router.get("/steelTowerMasterSearch", function (req, res, next) {
    res.render('steelTowerMasterSearch');
  });

  router.post("/login", passport.authenticate(
    "local-login", {
      successRedirect: "/",
      failureRedirect: "/login"
    })
  );

  router.post('/upload', function (req, res) {
    upload(req, res, function (err) {
      if (err) {
        res.send("Failed to write " + req.file.destination + " with " + err);
      } else {
        blobService.createBlockBlobFromLocalFile(containerName, req.file.originalname, req.file.path, function (error) {
          if (error) {
            console.log(error);
          } else {
            //写真情報をMongoDBに保存する
            var photo = new Photo();
            photo.image_id = req.file.originalname;
            photo.created_by = req.user.name;
            photo.latitude = 172.172;
            photo.langitude = 172.172;
            photo.save(function (err) {
              if (err) {
                console.error(err);
              } else {
                console.log("userModel saved:")
              }
            });
          }
        });
      }

      //サーバにアップされた原画像を縮小し、原画像と縮小画像をそれぞれAzureに送信する。
      Jimp.read(req.file.path, function (err, image) {
        if (err) throw err;
        image.resize(300, 200)                     // resize
          .write("./public/images/small-bw.jpg", function () {
            blobService.createBlockBlobFromLocalFile(containerName, "sample.jpg", "./public/images/small-bw.jpg", function (error) {
              res.send('<a href="/">TOP</a>' + "<p></p>create by " + req.user.name + "<p></p>uploaded " + req.file.originalname + "<p></p>mimetype: " +
                req.file.mimetype + "<p></p>Size: " + req.file.size);
              if (error) {
                console.log(error);
              } else {
                console.log('path' + req.file.path + ' Blob ' + req.file.originalname + ' upload finished.');
              }
            });
          });
      });
    });
  });

  router.post('/steelTowerMasterSearch', function (req, res) {
    Photo.find({
      latitude: { $gte: (req.body.latitude - 0.1) }, latitude: { $lte: (req.body.latitude + 0.1) },
      langitude: { $gte: (req.body.longitude - 0.1) }, langitude: { $lte: (req.body.longitude + 0.1) }
    }, function (err, docs) {
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
    res.send('<a href="/">TOP</a><p></p>' + req.body.latitude + req.body.longitude);
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