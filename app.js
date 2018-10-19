const express = require("express");
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
const flash = require("connect-flash");
const mongoose = require("mongoose");
const accountUser = require('./models/account_user');
const accountGroup = require('./models/account_group');
const Photo = require('./models/photo');
const Steel_tower_master = require('./models/steel_tower_master');
const multer = require('multer');
const Jimp = require("jimp");
const storage = require('azure-storage');
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const crypto = require("crypto");
const csurf = require("csurf");
const helmet = require('helmet');
require('date-utils');

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').load();
}

//MongoDB
mongoose.connect("mongodb://localhost/sra_watson",
  function (err) {
    if (err) {
      console.log(err);
    } else {
      console.log('connection success!');
    }
  });

//Sever upload
var multerStorage = multer.diskStorage(
  {
    destination(req, file, cb) {
      cb(null, './public/images');
    },
    filename(req, file, cb) {
      cb(null, file.originalname);
    }
  });
var upload = multer({ storage: multerStorage }).single('thumbnail');

//Azure blob
var blobService = storage.createBlobService();
var containerName = 'srablobtest';

passport.serializeUser(function (user, done) {
  done(null, user);
});

passport.deserializeUser(function (user, done) {
  done(null, user);
});

function getPasswordHash(plainPassword) {
  var sha = crypto.createHmac("sha256", process.env.PASSWORD_HASH_KEY);
  sha.update(plainPassword);
  return sha.digest("hex");
}

passport.use(
  "local-login",
  new LocalStrategy({
    usernameField: "username",
    passwordField: "password",
    passReqToCallback: true
  }, function (req, username, password, done) {
    process.nextTick(() => {
      accountUser.findOne({ "user_name": username }, function (error, user) {
        if (error) {
          //mongoDB findOne err
          return done(error);
        }
        var passwordHash = getPasswordHash(password);
        if (!user || user.password_hash != passwordHash) {
          return done(null, false, req.flash("message", "Invalid username or password."));
        }
        accountGroup.findOne({ "group_id": user.group_id }, function (err, group) {
          if (err || group === null) {
            //mongoDB findOne err
            return done(err);
          } else {
            return done(null, {
              name: user.user_name,
              permissions: group.permissions,
            });
          }
        });
      });
    });
  })
);

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

// passportの設定
app.use(session(
  {
    secret: 'keyboard cat',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 30
    }
  }));
app.use(passport.initialize());
app.use(passport.session());

//　認証情報、権限のチェック
var authorize = function (permission) {
  return function (req, res, next) {
    if (req.isAuthenticated() && req.user.permissions.indexOf(permission) >= 0) {
      console.log(req.isAuthenticated() + permission);
      return next();
    }
    res.status(200).send({ "error": "error" });
  };
}

//　ルーティング
app.use("/", (function () {
  var router = express.Router();

  router.get("/", function (req, res) {
    console.log("top");
    res.render("./index.ejs");
  });

  router.get("/login", function (req, res) {
    console.log("login");
    res.render("./login.ejs", {
      message: req.flash("message"),
    });
  });

  router.get('/upload', function (req, res, next) {
    res.render('upload', {
      title: 'BLOB Upload',
    });
  });

  router.get('/upload-ajax', function (req, res, next) {
    res.render('upload_ajax', {
    });
  });

  router.get("/steel-tower-master-search", function (req, res, next) {
    res.render('steelTowerMasterSearch', {
    });
  });

  //ログイン
  router.post("/login", passport.authenticate("local-login", { failureRedirect: "/login" }),
    function (req, res) {
      res.json(
        {
          "session_id": req.sessionID,
          "user_name": req.user.name,
          "permissions": req.user.permissions
        }
      );
    }
  );

  //画像アップロード
  router.post('/upload', authorize("sara_manager"), function (req, res) {
    upload(req, res, function (err) {
      if (err) {
        //upload エラー処理
        console.log(err);
        res.json({ "error": err });
      } else {
        //ファイル名　正規化
        var dt = new Date();
        var formatted = dt.toFormat("YYYYMMDDHH24MISS");
        var fileNameArray = req.file.originalname.split(".");
        if (fileNameArray.length == 1) {
          var uploadName = formatted;
          var thumbnailName = formatted + "_thumb";
        } else {
          var uploadName = formatted + "." + fileNameArray[fileNameArray.length - 1].toLowerCase();
          var thumbnailName = formatted + "_thumb." + fileNameArray[fileNameArray.length - 1].toLowerCase();
        }

        blobService.createBlockBlobFromLocalFile(containerName, uploadName,
          req.file.path, function (error) {
            if (error) {
              //blob登録 エラー処理
              res.json({ "error": "error" });
            } else {
              console.log("BLOB create!");
            }
          });

        Jimp.read(req.file.path, function (err, image) {
          if (err) {
            //jimp-read エラー処理
            res.json({ "error": "error" });
          } else {
            image.scale(0.1).write("./public/images/" + thumbnailName, function () {
              blobService.createBlockBlobFromLocalFile(containerName, thumbnailName,
                "./public/images/" + thumbnailName, function (error) {
                  if (error) {
                    //blob登録 エラー処理
                    res.json({ "error": "error" });
                  } else {
                    console.log("BLOB create!");
                    var photo = new Photo();
                    photo.image_id = uploadName;
                    photo.thumbnail_id = thumbnailName;
                    //photo.created_by = req.user.name;
                    photo.latitude = req.body.latitude;
                    photo.longitude = req.body.longitude;
                    photo.revel_judged_by_human = req.body.revel_judged_by_human;
                    photo.training_flag = 0;
                    photo.save(function (err) {
                      if (err) {
                        //写真情報登録　エラー処理
                        res.json({ "error": "error" });
                      } else {
                        console.log("photo info!")
                        res.json({ "message": "success" });
                      }
                    });
                  }
                });
            });
          }
        });
      }
    });
  });

  //鉄塔検索
  router.post('/steel-tower-master-search', function (req, res) {
    var range = 0.01;

    var arr = {};
    if (req.body.steelTowerID) arr['id'] = req.body.steelTowerID;
    if (req.body.name) arr['name'] = req.body.name;
    if (req.body.route_name) arr['route_name'] = req.body.route_name;
    if (req.body.latitude) {
      arr['latitude'] = { $gte: (req.body.latitude - range), $lte: (parseFloat(req.body.latitude) + range) };
    }
    if (req.body.longitude) {
      arr['longitude'] = { $gte: (req.body.longitude - range), $lte: (parseFloat(req.body.longitude) + range) };
    }

    console.log(arr);

    Steel_tower_master.find(arr, function (err, docs) {
      if (err) {
        res.json({ "error": "error" });
      } else {
        res.json(docs);
      }
    });
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