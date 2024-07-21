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

app.use('/login', require('./route/login.js'))