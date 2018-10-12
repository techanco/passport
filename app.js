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

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').load();
}

mongoose.connect("mongodb://localhost/sra_watson",
  function (err) {
    if (err) {
      console.log(err);
    } else {
      console.log('connection success!');
    }
  });

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
          return done(error);
        }
        var passwordHash = getPasswordHash(password);
        if (!user || user.password_hash != passwordHash) {
          return done(null, false, req.flash("message", "Invalid username or password."));
        }
        accountGroup.findOne({ "group_id": user.group_id }, function (err, group) {
          if (err || group === null) {
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

//  認証情報のチェック
var sessionCheck = function (req, res, next) {
  if (req.user) {
    next();
  } else {
    res.redirect('/login');
  }
}

var authorize = function (permission) {
  return function (req, res, next) {
    if (req.isAuthenticated() &&
      req.user.permissions === permission) {
      return next();
    }
    res.redirect("/login");
  };
}

//ルーティング
app.use("/", (function () {
  var router = express.Router();

  router.get("/", sessionCheck, function (req, res) {
    res.render("./index.ejs", {
      session_ID: req.sessionID,
      user_name: req.user.name,
      permissions: req.user.permissions
    });
  });

  router.get("/login", function (req, res) {
    res.render("./login.ejs", { message: req.flash("message") });
  });

  router.get('/destroy', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        res.send(err)
        return
      }
      res.redirect('/login')
    })
  });

  router.get('/upload', sessionCheck, function (req, res, next) {
    res.render('upload', { title: 'BLOB Upload' });
  });

  router.get("/steelTowerMasterSearch", sessionCheck, function (req, res, next) {
    res.render('steelTowerMasterSearch');
  });

  router.post("/login", passport.authenticate(
    "local-login", {
      successRedirect: "/",
      failureRedirect: "/login",
    })
  );

  router.post('/upload', function (req, res) {
    if (!req.user) {
      res.status(400).send({ error: 'Something failed!' });
    }

    upload(req, res, function (err) {
      if (err) {
        res.send("Failed to write " + req.file.destination + " with " + err);
      } else {
        blobService.createBlockBlobFromLocalFile(containerName, req.file.originalname,
          req.file.path, function (error) {
            if (error) {
              res.send(error);
            } else {
              console.log("BLOB create!")
            }
          });
      }

      var array = req.file.originalname.split(".");
      var thumbnailName = array[0] + "_thumb.jpg";

      Jimp.read(req.file.path, function (err, image) {
        if (err) throw err;
        image.resize(300, 200)
          .write("./public/images/" + thumbnailName, function () {
            blobService.createBlockBlobFromLocalFile(containerName, thumbnailName,
              "./public/images/" + thumbnailName, function (error) {
                if (error) {
                  res.send(error);
                } else {
                  var photo = new Photo();
                  photo.image_id = req.file.originalname;
                  photo.thumbnail_id = thumbnailName;
                  photo.created_by = req.user.name;
                  photo.latitude = 172.172;
                  photo.langitude = 172.172;
                  photo.revel_judged_by_human = 0;
                  photo.training_flag = 0;
                  photo.save(function (err) {
                    if (err) {
                      console.error(err);
                    } else {
                      console.log("userModel saved:")
                    }
                  });
                }
              });
          });
      });
      res.send('<a href="/">TOP</a>' + "<p></p>create by " + req.user.name
        + "<p></p>uploaded " + req.file.originalname + "<p></p>mimetype: "
        + req.file.mimetype + "<p></p>Size: " + req.file.size);
    });
  });

  router.post('/steelTowerMasterSearch', function (req, res) {
    var range = 0.01;
    Steel_tower_master.find({
      id: req.body.steelTowerID,
      name: req.body.name,
      route_name: req.body.route_name,
      latitude: { $gte: (req.body.latitude - range) },
      latitude: { $lte: (parseFloat(req.body.latitude) + range) },
      longitude: { $gte: (req.body.longitude - range) },
      longitude: { $lte: (parseFloat(req.body.longitude) + range) }
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
      res.send('<a href="/">TOP</a><p></p>' + docs[0]);
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