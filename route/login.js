const router = require('express').Router()
const express = require('express');
const app = express();
const session = require('express-session')
const passport = require('passport')
const LocalStrategy = require('passport-local')
const MongoStore = require('connect-mongo')

app.use(passport.initialize())
app.use(session({
  secret: process.env.SECRET_PASSWORD,
  resave : false,
  saveUninitialized : false,
  cookie : { maxAge : 60 * 60 * 1000 },
  store : MongoStore.create({
    mongoUrl : process.env.DB_URL,
    dbName : 'forum'
  })
}))
app.use(passport.session()) 

passport.use(new LocalStrategy(async (입력한아이디, 입력한비번, cb) => {
    let result = await db.collection('user').findOne({ username : 입력한아이디})
    if (!result) {
      return cb(null, false, { message: '아이디 DB에 없음' })
    }
    
    if (await bcrypt.compare(입력한비번, result.password)) {
      return cb(null, result)
    } else {
      return cb(null, false, { message: '비번불일치' });
    }
  }))

  passport.serializeUser((user, done) => {
    console.log(user)
    process.nextTick(() => {          
    done(null, { id: user._id, username: user.username })
    })
})
passport.deserializeUser(async(user, done)=>{
    let result = await db.collection('user').findOne({_id: new ObjectId(user.id)})
    delete result.password
    process.nextTick(()=>{
        done(null, result)
    })
})

router.get('/', (req, res)=>{
  res.send('여기까지')
})


module.exports = router
