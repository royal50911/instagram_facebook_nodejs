//dependencies for each module used
var express = require('express');
var passport = require('passport');
var InstagramStrategy = require('passport-instagram').Strategy;
var http = require('http');
var path = require('path');
var handlebars = require('express-handlebars');
var bodyParser = require('body-parser');
var session = require('express-session');
var cookieParser = require('cookie-parser');
var dotenv = require('dotenv');
var mongoose = require('mongoose');
var Instagram = require('instagram-node-lib');
var async = require('async');
var app = express();

//local dependencies
var models = require('./models');

//client id and client secret here, taken from .env
dotenv.load();
var INSTAGRAM_CLIENT_ID = process.env.INSTAGRAM_CLIENT_ID;
var INSTAGRAM_CLIENT_SECRET = process.env.INSTAGRAM_CLIENT_SECRET;
var INSTAGRAM_CALLBACK_URL = process.env.INSTAGRAM_CALLBACK_URL;
Instagram.set('client_id', INSTAGRAM_CLIENT_ID);
Instagram.set('client_secret', INSTAGRAM_CLIENT_SECRET);

//connect to database
mongoose.connect(process.env.MONGODB_CONNECTION_URL);
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function (callback) {
  console.log("Database connected succesfully.");
});

// Passport session setup.
//   To support persistent login sessions, Passport needs to be able to
//   serialize users into and deserialize users out of the session.  Typically,
//   this will be as simple as storing the user ID when serializing, and finding
//   the user by ID when deserializing.  However, since this example does not
//   have a database of user records, the complete Instagram profile is
//   serialized and deserialized.
passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null, obj);
});


// Use the InstagramStrategy within Passport.
//   Strategies in Passport require a `verify` function, which accept
//   credentials (in this case, an accessToken, refreshToken, and Instagram
//   profile), and invoke a callback with a user object.
passport.use(new InstagramStrategy({
    clientID: INSTAGRAM_CLIENT_ID,
    clientSecret: INSTAGRAM_CLIENT_SECRET,
    callbackURL: INSTAGRAM_CALLBACK_URL
  },
  function(accessToken, refreshToken, profile, done) {
    // asynchronous verification, for effect...
   models.User.findOne({
    "ig_id": profile.id
   }, function(err, user) {
      if (err) {
        return done(err); 
      }
      
      //didnt find a user
      if (!user) {
        newUser = new models.User({
          name: profile.username, 
          ig_id: profile.id,
          ig_access_token: accessToken
        });

        newUser.save(function(err) {
          if(err) {
            console.log(err);
          } else {
            console.log('user: ' + newUser.name + " created.");
          }
          return done(null, newUser);
        });
      } else {
        //update user here
        user.ig_access_token = accessToken;
        user.save();
        process.nextTick(function () {
          // To keep the example simple, the user's Instagram profile is returned to
          // represent the logged-in user.  In a typical application, you would want
          // to associate the Instagram account with a user record in your database,
          // and return that user instead.
          return done(null, user);
        });
      }
   });
  }
));


//Configures the Template engine
app.engine('handlebars', handlebars({defaultLayout: 'layout'}));
app.set('view engine', 'handlebars');
app.set('views', __dirname + '/views');
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(session({ secret: 'keyboard cat',
                  saveUninitialized: true,
                  resave: true}));
app.use(passport.initialize());
app.use(passport.session());

//set environment ports and start application
app.set('port', process.env.PORT || 3000);

// Simple route middleware to ensure user is authenticated.
//   Use this route middleware on any resource that needs to be protected.  If
//   the request is authenticated (typically via a persistent login session),
//   the request will proceed.  Otherwise, the user will be redirected to the
//   login page.
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { 
    return next(); 
  }
  res.redirect('/login');
}


function ensureAuthenticatedInstagram(req, res, next) {
  if (req.isAuthenticated() && !!req.user.ig_id) { 
    return next(); 
  }
  res.redirect('/login');
}


//routes
app.get('/', function(req, res){
  res.render('login');
});

app.get('/login', function(req, res){
  res.render('login', { user: req.user });
});


app.get('/account', ensureAuthenticated, function(req, res){

  res.render('account', {user: req.user});
});


app.get('/igaccount', ensureAuthenticated, function(req, res){
  var query = models.User.where({ ig_id: req.user.ig_id});
  query.findOne(function (err, user) {
    if (err) return err;
    if (user) {
      // doc may be null if no document matched
      Instagram.users.info({
        user_id: user.ig_id,
        access_token: user.ig_access_token,
        complete: function(data) {
          //console.log(data.profile_picture);
          console.log(data);
          console.log("username: " + data.username);
          console.log("full_name: " + data.full_name);
          console.log("media: " + data.counts.media);
          console.log("followed_by: " + data.counts.followed_by);
          console.log("follows: " + data.counts.follows);
          res.render('igaccount', {user: req.user, user_info: data});
        }
        
      });
    }
  });
});

app.get('/igphotos', ensureAuthenticatedInstagram, function(req, res){
  var query  = models.User.where({ ig_id: req.user.ig_id });
  query.findOne(function (err, user) {
    if (err) return err;
    if (user) {
      // doc may be null if no document matched
      Instagram.users.liked_by_self({
        access_token: user.ig_access_token,
        complete: function(data) {
          console.log(data);
          //Map will iterate through the returned data obj
          var imageArr = data.map(function(item) {
            //create temporary json object
            tempJSON = {};
            tempJSON.url = item.images.low_resolution.url;
            //insert json object into image array
            return tempJSON;
          });
          res.render('photos', {photos: imageArr});
        }
      }); 
    }
  });
});

/*
app.get('/igSelfPhotos', ensureAuthenticatedInstagram, function(req, res){
  var query = models.User.where({ ig_id: req.user.ig_id });
  query.findOne(function (err, user) {
    if (err) return err;
    if (user) {
      Instagram.users.self({
        access_token: user.ig_access_token,
        complete: function(data) {
          console.log("pagination: ");
          console.log(pagination);
          console.log("Data:");
          console.log(data);
          var selfPhotosArr = data.map(function(item) {
              if(item.user.username == user.name) {
                tempJSON = {};
                tempJSON.url = item.images.low_resolution.url;
                return tempJSON;
              }
          });
          res.render('igSelfPhotos', {user_pics: selfPhotosArr});
        }
      })
    }
  });
});
*/

/*
app.get('/igSelfPhotos', ensureAuthenticatedInstagram, function(req, res){
  var query = models.User.where({ ig_id: req.user.ig_id });
  query.findOne(function (err, user) {
    if (err) return err;
    if (user) {
      Instagram.users.recent({
        access_token: user.ig_access_token,
        user_id: user.ig_id,
        
        complete: function(data, pagination) {

          var count = 1;
          var selfPhotosArr = [];
         
          console.log("Data:");
          console.log(data);
          // NOTE when no pics left, pagination returns '{}'
          console.log("Pagination:");
          console.log(pagination);
          selfPhotosArr = data.map(function(item) {
              if(item.user.username == user.name) {
                tempJSON = {};
                tempJSON.url = item.images.low_resolution.url;
                tempJSON.filter = item.filter;
                tempJSON.count = count;
                count += 1;
                return tempJSON;
              }
          });
          /* BROKEN
          if(pagination != null) {
            console.log("oo");
            var p = pagination.next_max_id;
            var p2 = pagination;
            while(p2 != "{}") {
              Instagram.users.recent({
                access_token: user.ig_access_token,
                user_id: user.ig_id,
                max_id: p,
                complete: function(data, pagination) {

        
         
         
                  console.log("Data:");
                  console.log(data);
                  // NOTE when no pics left, pagination returns '{}'
                  console.log("Pagination:");
                  console.log(pagination);
                  p = pagination.next_max_id;
                  p2 = pagination;
                  selfPhotosArr = data.map(function(item) {
                  if(item.user.username == user.name) {
                    tempJSON = {};
                    tempJSON.url = item.images.low_resolution.url;
                    tempJSON.count = count;
                    count += 1;
                    return tempJSON;
                  }
                  });
              }
            })
          }
        } */
        /*
          res.render('igSelfPhotos', {user_pics: selfPhotosArr});
        }
      })
    }
  });
});
*/

app.get('/igMediaCounts', ensureAuthenticatedInstagram, function(req, res){
  var query  = models.User.where({ ig_id: req.user.ig_id });
  query.findOne(function (err, user) {
    if (err) return err;
    if (user) {
      Instagram.users.follows({ 
        user_id: user.ig_id,
        access_token: user.ig_access_token,
        complete: function(data) {
          // an array of asynchronous functions
          var asyncTasks = [];
          var mediaCounts = [];
           
          data.forEach(function(item){
            asyncTasks.push(function(callback){
              // asynchronous function!
              Instagram.users.info({ 
                  user_id: item.id,
                  access_token: user.ig_access_token,
                  complete: function(data) {
                    mediaCounts.push(data);
                    callback();
                  }
                });            
            });
          });
          
          // Now we have an array of functions, each containing an async task
          // Execute all async tasks in the asyncTasks array
          async.parallel(asyncTasks, function(err){
            // All tasks are done now
            if (err) return err;
            return res.json({users: mediaCounts});        
          });
        }
      });   
    }
  });
});




app.get('/igSelfPhotosAsync', ensureAuthenticatedInstagram, function(req, res){
  var query  = models.User.where({ ig_id: req.user.ig_id });
  query.findOne(function (err, user) {
    if (err) return err;
    if (user) {

      var max_photo_count = 0;
      // get user media total count
      //async.nextTick(function() {
      Instagram.users.info ({
        user_id: user.ig_id,
        access_token: user.ig_access_token,
        complete: function(data) {
          // set max photos based on how many users have
          max_photo_count = data.counts.media;
          console.log("photos user uploaded: " + max_photo_count);

          // for async whilst condition, to see where in photos we are
      // To figure this out, I consulted node.js async readme and
      // https://gist.github.com/harthur/2581133
      var cur_photo_count = 0;
      var user_data = [];
      var next_max_id = null;

        async.whilst(
          //TEST case for whilst
          function() {
            console.log('test: ' + (cur_photo_count < max_photo_count));
            console.log("cur: " + cur_photo_count);
            console.log("max: " + max_photo_count);
            return cur_photo_count < max_photo_count;
          },
          //repeatedly call this function until TEST is false
          function(callback) {
            console.log("getting photos");
            
            var options = {
              user_id: user.ig_id,
              access_token: user.ig_access_token,
              count: max_photo_count,
              max_id: next_max_id,
              complete: function(data, pagination) {
                next_max_id = pagination.next_max_id;
                console.log('next_max_id: ' + next_max_id);
                console.log("vs pagination return: " + pagination.next_max_id);
                console.log('BEGIN DATA' + data);
                console.log("end DATA!");
                data.forEach(function(item) {
                  user_data.push(item);
                  cur_photo_count++;
                });
                 setTimeout(callback, 2000);
              }
            }

            if(next_max_id) {
              console.log("IN IF STATEMENT");

              options.next_max_id = next_max_id;
            }
            Instagram.users.recent(options);
          },
          function(err) {
            return res.json({users: user_data, photocount: max_photo_count });
          }
        );
        }

      });
      //});
      
    }
  });
});

app.get('/igSelfPhotos', ensureAuthenticated, function(req, res){
  res.render('igSelfPhotos');
});

app.get('/visualization', ensureAuthenticatedInstagram, function (req, res){
  res.render('visualization');
}); 


app.get('/c3visualization', ensureAuthenticatedInstagram, function (req, res){

  res.render('c3visualization');
}); 

app.get('/d3visualization', ensureAuthenticatedInstagram, function (req, res) {
  res.render('d3visualization');
})

app.get('/auth/instagram',
  passport.authenticate('instagram'),
  function(req, res){
    // The request will be redirected to Instagram for authentication, so this
    // function will not be called.
  });

app.get('/auth/instagram/callback', 
  passport.authenticate('instagram', { failureRedirect: '/login'}),
  function(req, res) {
    res.redirect('/igaccount');
  });

app.get('/logout', function(req, res){
  req.logout();
  res.redirect('/');
});

http.createServer(app).listen(app.get('port'), function() {
    console.log('Express server listening on port ' + app.get('port'));
});
