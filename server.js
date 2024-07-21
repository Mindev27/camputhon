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
    res.render('register.ejs')
});

app.post('/register', checkIdPw, async (req, res, next) => {
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
        password : hashed,
        isAdmin : false
    })

    // 자동 로그인 처리
    passport.authenticate('local', (err, user, info) => {
        if (err) return next(err);
        if (!user) return res.status(401).json(info.message);
        req.logIn(user, (err) => {
            if (err) return next(err);
            res.render('timetable.ejs'); // 로그인 되면 시간표 입력페이지로 이동
        });
    })(req, res, next);
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
    res.render('timetable.ejs')
});

app.get('/', (req, res) => {
    res.render('2페이지', {
        pageTitle: 'Open Lecture Time',
        logoSrc: 'open_lecture_time_logo.png'
    });
});


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

app.get('/', (req, res) => {
    // 데이터 예시
    const universities = [
        { value: 'uni1', label: 'University 1' },
        { value: 'uni2', label: 'University 2' }
    ];
    const majors = [
        { value: 'major1', label: 'Major 1' },
        { value: 'major2', label: 'Major 2' }
    ];
    res.render('register.ejs', { universities, majors });
});

app.get('/', (req, res) => {
    res.render('register_univ.ejs'); // EJS 파일 이름
});
app.post('/submit', (req, res) => {
    console.log(req.body); // 폼에서 전달된 데이터 출력
    // 여기에서 요청 데이터를 처리하고 응답을 반환합니다
    res.send('폼 제출이 완료되었습니다!');
});

const lectures = [
    {
      day: '월요일',
      time: '12:00',
      title: '고단백질의 역사와 이해',
      instructor: '김민성',
      tags: ['체육', '역사'],
      duration: '1시간',
      location: '정보문화관IQ 301',
      description: '단백질이 진화한 역사와 과정, 고단백질 섭취의 영향에 대한 이해와 고찰'
    },
    {
      day: '화요일',
      time: '12:00',
      title: '간단 실화 프로그래밍',
      instructor: '이경민',
      tags: ['코딩', 'AI'],
      duration: '1시간 30분',
      location: '씨아이빌딩',
      description: '강의 이후 보강을 위한 추가 수업, 타 학과 학생들도 수강 가능합니다.'
    },
    {
      day: '수요일',
      time: '13:00',
      title: '범죄심리를 다룬 작품으로...',
      instructor: '박지성',
      tags: ['경제', '심리', '사회'],
      duration: '40분',
      location: '문화관 K421',
      description: '범죄심리를 다룬 작품의 이해를 통해 바라본 사회적 배경'
    },
    {
      day: '목요일',
      time: '16:00',
      title: 'IT산업의 시작과 기초',
      instructor: '노준혁',
      tags: ['IT'],
      duration: '1시간 20분',
      location: '씨아이빌딩',
      description: 'IT산업의 기초를 간단하게 숙지하여 다루는 강의'
    }
  ];

  app.get('/', (req, res) => {
    res.render('search.ejs', { lectures: lectures });
  });
  