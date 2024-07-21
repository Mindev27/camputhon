const express = require('express');
const app = express();
const { MongoClient, ObjectId } = require('mongodb');
const methodOverride = require('method-override')
const bcrypt = require('bcrypt')
const MongoStore = require('connect-mongo')
require('dotenv').config()

app.use(methodOverride('_method')) 
app.use(express.static(__dirname + '/public'));
app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


const session = require('express-session')
const passport = require('passport')
const LocalStrategy = require('passport-local')

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


let connectDB = require('./database.js')


let db;
connectDB.then((client)=>{
    console.log('DB연결성공');
    db = client.db('forum');
    app.listen(process.env.PORT, function() {
        console.log("listening on 8080");
    });
}).catch((err)=>{
    console.log(err);
})


app.get('/list', async(req, res) => {
    let result = await db.collection('post').find().toArray();
    res.render('list.ejs', { post : result });
});


app.get('/detail/:id', async (req, res)=>{
    let result = await db.collection('post').findOne({ _id : new ObjectId(req.params.id) })
    res.render('detail.ejs', { data : result });
})

app.get('/edit/:id', async (req, res)=>{
    let result = await db.collection('post').findOne({ _id : new ObjectId(req.params.id) })
    res.render('edit.ejs', { data : result });
})


app.put('/edit', async(req, res) => {
    console.log(req.body);

    try {
        if(req.body.title == '') {
            res.send("no title error");
        } else {
            await db.collection('post').updateOne(
                { _id: new ObjectId(req.body.id) },
                { $set: { title: req.body.title, content: req.body.content } }
            );
            res.redirect('/list');
        }
    } catch(e) {
        console.log(e);
        res.status(500).send("server error");
    }
});

app.get('/write', async(req, res) => {
    console.log(req.user)
    if(!req.user) {
        return res.redirect('/login');
    }
    if(req.user.isAdmin === false) {
        res.send("쓰기 권한이 없습니다!");
    }
    res.render('write.ejs');
});

app.post('/newpost', async(req, res) => {

    try {
        if(req.body.title == '') {
            res.send("no title error");
        } else {
            await db.collection('post').insertOne({
                title : req.body.title,
                applicationStartTime : req.body.applicationStartTime,
                applicationEndTime : req.body.applicationEndTime,
                lectureStartTime : req.body.lectureStartTime,
                lectureEndTime : req.body.lectureEndTime,
                applicationLink : req.body.applicationLink
            })
            res.redirect('/list');
        }
    } catch(e) {
        console.log(e);
        res.status(500).send("server error");
    }
});

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

function checkIdPw(req, res, next) {
    if (!req.body.username || !req.body.password) {
        res.send("아이디 비번을 입력하세요.");
    } else {
        next();
    }
}


app.get('/login', async(req, res) => {
    res.render('login.ejs');
  });
  
  app.post('/login', checkIdPw, async (req, res, next) => {
    passport.authenticate('local', (error, user, info)=>{
        if(error) return res.status(500).json(error)
        if(!user) return res.status(401).json(info.message)
        req.logIn(user, (err)=>{
            if(err) return next(err)
            res.render('mypage.ejs', { data : req.user })
        })
    })(req, res, next)
});

  
app.get('/register', (req, res) => {
    res.render('register.ejs')
})

app.post('/register', checkIdPw, async (req, res) => {
    let sameId = await db.collection('user').findOne({ username: req.body.username })
    if(sameId) {
        return res.status(409).json({ message: '이미 사용중인 아이디입니다.' })
    }

    if(req.body.password != req.body.passwordCheck ) {
        return res.status(400).json({ message: '비밀번호가 일치하지 않습니다.' }); 
    }

    let hashed = await bcrypt.hash(req.body.password, 10)
    console.log(hashed)

    let result = await db.collection('user').insertOne({
        username : req.body.username,
        password : hashed
    })
    res.redirect('/list')
})