const express = require('express')
const bodyParser = require('body-parser')
const session = require('express-session')
const passport = require('passport')
const TwitterStrategy = require('passport-twitter')
const uuid = require('uuid/v4')
const security = require('./helpers/security')
const auth = require('./helpers/auth')
const cacheRoute = require('./helpers/cache-route')
const socket = require('./helpers/socket')
const request = require('request');

const app = express()

app.set('port', (process.env.PORT || 5000))
app.set('views', __dirname + '/views')
app.set('view engine', 'ejs')

app.use(express.static(__dirname + '/public'))
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(passport.initialize());
app.use(session({
  secret: 'keyboard cat',
  resave: false,
  saveUninitialized: true
}))

const twitterId = process.env.TWITTER_ACCESS_TOKEN.substring(0, process.env.TWITTER_ACCESS_TOKEN.indexOf("-"));

// start server
const server = app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'))
})

// initialize socket.io
socket.init(server)

// form parser middleware
var parseForm = bodyParser.urlencoded({ extended: false })


/**
 * Receives challenge response check (CRC)
 **/
app.get('/webhook/twitter', function(request, response) {

  var crc_token = request.query.crc_token

  if (crc_token) {
    var hash = security.get_challenge_response(crc_token, auth.twitter_oauth.consumer_secret)

    response.status(200);
    response.send({
      response_token: 'sha256=' + hash
    })
  } else {
    response.status(400);
    response.send('Error: crc_token missing from request.')
  }
})


/**
 * Receives Account Acitivity events
 **/
app.post('/webhook/twitter', function(req, res) {

  console.log(req.body)
  
  socket.io.emit(socket.activity_event, {
    internal_id: uuid(),
    event: req.body
  });

  /* if message */
  if (Array.isArray(req.body.direct_message_events) &&
      req.body.direct_message_events.length>0) {
    const message = req.body.direct_message_events[0];
    const text = message.message_create.message_data.text;
    const senderId = message.message_create.sender_id;
    if (senderId!==twitterId) {
      const myResponse = "Hello, How can I help you?";
      sendMessage(myResponse, senderId);
    }
  }
/*   } else if (Array.isArray(req.body.tweet_create_events) &&
      req.body.tweet_create_events.length>0) {
        const message = req.body.tweet_create_events[0];
        const text = message.text;
        const senderId = message.user.id_str;
      if (senderId!==twitterId && message.in_reply_to_user_id_str) {
        const screenName = message.user.screen_name;
        myResponse = '@'+screenName+' '+dialogflowResponse;
        sendStatus(myResponse, senderId);
      }
  } */

  res.send('200 OK')
})


/**
 * Serves the home page
 **/
app.get('/', function(request, response) {
  response.render('index')
})


/**
 * Subscription management
 **/

auth.basic = auth.basic || ((req, res, next) => next())

app.get('/subscriptions', auth.basic, cacheRoute(1000), require('./routes/subscriptions'))


/**
 * Starts Twitter sign-in process for adding a user subscription
 **/
app.get('/subscriptions/add', passport.authenticate('twitter', {
  callbackURL: '/callbacks/addsub'
}));

/**
 * Starts Twitter sign-in process for removing a user subscription
 **/
app.get('/subscriptions/remove', passport.authenticate('twitter', {
  callbackURL: '/callbacks/removesub'
}));


/**
 * Webhook management routes
 **/
var webhook_view = require('./routes/webhook')
app.get('/webhook', auth.basic, auth.csrf, webhook_view.get_config)
app.post('/webhook/update', parseForm, auth.csrf, webhook_view.update_config)
app.post('/webhook/validate', parseForm, auth.csrf, webhook_view.validate_config)
app.post('/webhook/delete', parseForm, auth.csrf, webhook_view.delete_config)


/**
 * Activity view
 **/
app.get('/activity', auth.basic, require('./routes/activity'))


/**
 * Handles Twitter sign-in OAuth1.0a callbacks
 **/
app.get('/callbacks/:action', passport.authenticate('twitter', { failureRedirect: '/' }),
  require('./routes/sub-callbacks'))



  /*
  * Send Messages
  /* */
  function sendMessage(text, recipientId) {
    request.post('https://api.twitter.com/1.1/direct_messages/events/new.json',{
      oauth: auth.twitter_oauth,
      json:{
        event: {
          type: "message_create",
          message_create: {
            target: {
              recipient_id: recipientId
            },
            message_data: {
              text: text,
              quick_reply: {
                type: "options",
                options: [
                  {
                    label: "Red Bird",
                    description: "A description about the red bird.",
                    metadata: "external_id_1"
                  },
                  {
                    label: "Blue Bird",
                    description: "A description about the blue bird.",
                    metadata: "external_id_2"
                  },
                  {
                    label: "Black Bird",
                    description: "A description about the black bird.",
                    metadata: "external_id_3"
                  },
                  {
                    label: "White Bird",
                    description: "A description about the white bird.",
                    metadata: "external_id_4"
                  }
                ]
              }
            }
          }
        }
      }
    }, function(err, resp, body) {
      if (err) {
        console.eror('Failed to send message: ' + err);
      }
    });
  }
