const express = require('express');
const app = express();
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
const methodOverride = require('method-override')
const bcrypt = require('bcrypt')
const MongoStore = require('connect-mongo')
require('dotenv').config()

const bodyParser = require('body-parser');
app.use(bodyParser.json());

app.use(methodOverride('_method')) 
app.use(express.static(path.join(__dirname, 'public')));
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


app.get('/write', async(req, res) => {
    console.log(req.user)
    if(!req.user) {
        return res.redirect('/login');
    }
    if(req.user.isAdmin === false) {
        return res.send("쓰기 권한이 없습니다!");
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
                applicationStartTime : new Date(req.body.applicationStartTime),
                applicationEndTime : new Date(req.body.applicationEndTime),
                lectureStartTime : new Date(req.body.lectureStartTime),
                lectureEndTime : new Date(req.body.lectureEndTime),
                lectureDay : req.body.lectureDay,
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
    const universities = [
        { value: 'uni1', label: '동국대학교' }
    ];
    const majors = [
        { value: 'major1', label: '인공지능전공' },
        { value: 'major2', label: '데이터사이언스전공' },
        { value: 'major3', label: '컴퓨터공학전공' },
        { value: 'major4', label: '멀티미디어소프트웨어전공' }
    ];
    res.render('register.ejs', { universities, majors });
});

app.post('/register', checkIdPw, async (req, res, next) => {
    console.log(req.body);

    let sameId = await db.collection('user').findOne({ username: req.body.username });
    if (sameId) {
        return res.status(409).json({ message: '이미 사용중인 아이디입니다.' });
    }

    let hashed = await bcrypt.hash(req.body.password, 10);
    console.log(hashed);

    let result = await db.collection('user').insertOne({
        username : req.body.username,
        password : hashed,
        isAdmin : false,
        name: req.body.name,
        email : req.body.email,
        university : req.body.universities,
        major : req.body.major
    });

    if (result.insertedId) {
        res.status(201).json({ message: '회원가입 성공', userId: result.insertedId });
    } else {
        res.status(500).json({ message: '회원가입 실패' });
    }
});


app.post('/submit-timetable', async (req, res) => {
    const { selectedCells } = req.body;

    console.log('Received selected cells:', selectedCells);
    console.log('User:', req.user);

    try {
        if (!req.user) {
            console.error('User not logged in');
            return res.status(401).json({ success: false, message: '사용자가 로그인되어 있지 않습니다.' });
        }

        const result = await db.collection('user').updateOne(
            { _id: new ObjectId(req.user._id) },
            { $set: { selectedCells } }
        );

        console.log('Database update result:', result);

        if (result.modifiedCount === 0) {
            console.error('Database update failed');
            return res.status(400).json({ success: false, message: '시간표 업데이트에 실패했습니다.' });
        }

        res.json({ success: true, message: '시간표가 성공적으로 저장되었습니다.' });
    } catch (error) {
        console.error('Error saving timetable selection:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다: ' + error.message });
    }
});


app.get('/timetable', async (req, res) => {
    if (req.isAuthenticated()) { // 로그인 상태 확인
        res.render('timetable.ejs');
    } else {
        res.redirect('/login'); // 로그인 페이지로 리다이렉트
    }
});


app.get('/mytimetable', async (req, res) => {
    // console.log(req.user)
    res.render('mytimetable.ejs', { data : req.user })
})

app.get('/mytimetableedit', async (req, res) => {
    // console.log(req.user)
    res.render('mytimetableedit.ejs', { data : req.user })
})

app.get('/interests', (req, res) => {
    res.render('2페이지.ejs', {
        pageTitle: 'Open Lecture Time',
        logoSrc: '/open_lecture_time_logo.png',
        heading: '오픈렉처타임에 오신 것을 환영합니다!',
        interests: [
            { id: 'it', label: 'IT' },
            { id: 'economy', label: '경제' },
            { id: 'law', label: '법' },
            { id: 'art', label: '예술' },
            { id: 'psychology', label: '심리' },
            { id: 'religion', label: '종교' },
            { id: 'management', label: '경영' },
            { id: 'society', label: '사회' },
            { id: 'history', label: '역사' },
            { id: 'science', label: '과학' },
            { id: 'coding', label: '코딩' },
            { id: 'math', label: '수학' },
            { id: 'ai', label: 'AI' },
            { id: 'physical', label: '체육' }
        ]
    });
});

app.post('/interests', async (req, res) => {
    console.log('User:', req.user);

    if (!req.user) {
        console.error('User not logged in');
        return res.status(401).json({ success: false, message: '사용자가 로그인되어 있지 않습니다.' });
    }

    console.log('Request body:', req.body);

    const { interests } = req.body;
    console.log('Selected interests:', interests);

    try {
        const result = await db.collection('user').updateOne(
            { _id: new ObjectId(req.user._id) },
            { $set: { selectedInterests: interests } }
        );

        console.log('Database update result:', result);
        res.json({ success: true, message: '관심사가 성공적으로 저장되었습니다.' });
    } catch (error) {
        console.error('Error updating interests:', error);
        res.status(500).json({ success: false, message: '서버 오류가 발생했습니다: ' + error.message });
    }
});

app.get('/searchlecture', async (req, res) => {
    let posts = await db.collection('post').find().toArray();
    let user = req.user;

    console.log(posts);

    let canListenLecture = [];

    const addMinutes = (date, minutes) => {
        return new Date(date.getTime() + minutes * 60000);
    }

    posts.forEach(post => {
        let lectureTimes = [];
        let startTime = addMinutes(new Date(post.lectureStartTime), 540);
        let endTime = addMinutes(new Date(post.lectureEndTime), 540);
        let dayOfWeek = post.lectureDay.toLowerCase().slice(0, 3);

        console.log(post.title, startTime, endTime);
        while (startTime < endTime) {
            let hours = startTime.getUTCHours().toString().padStart(2, '0');
            let minutes = startTime.getUTCMinutes().toString().padStart(2, '0');
            if(minutes == 0) lectureTimes.push(`${dayOfWeek}-${hours}`);
            else lectureTimes.push(`${dayOfWeek}-${hours}-${minutes}`);
            
            startTime = addMinutes(startTime, 30);
        }

        console.log(lectureTimes);

        let canAttend = lectureTimes.every(time => user.selectedCells.includes(time));
        
        if (canAttend) {
            canListenLecture.push(post);
        }
    });

    console.log(canListenLecture);
    res.render('list.ejs', { post : canListenLecture });
})