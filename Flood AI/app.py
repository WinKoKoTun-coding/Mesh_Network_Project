from datetime import datetime
import json
import os
from flask import Flask, flash, redirect, render_template, request, session, url_for
from flask_sqlalchemy import SQLAlchemy
from werkzeug.utils import secure_filename

app = Flask(__name__)

# Database configuration
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///rescue.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.secret_key = 'mesh_rescue_secret_key'

# Upload folder configuration
UPLOAD_FOLDER = os.path.join('static', 'uploads')
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

db = SQLAlchemy(app)


# --- Database Models ---


class RescueRequest(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    phone = db.Column(db.String(50), nullable=False)
    people_count = db.Column(db.Integer, nullable=False, default=1)
    location = db.Column(db.String(200), nullable=False)
    urgency = db.Column(db.String(50), nullable=False, default='High')
    message = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(50), nullable=False, default='Pending')
    timestamp = db.Column(db.String(100), nullable=False)
    image_filename = db.Column(db.String(200), nullable=True)
    reactions = db.Column(
        db.Text,
        nullable=False,
        default='{"like": 0, "love": 0, "care": 0, "haha": 0}',
    )

    comments = db.relationship(
        'Comment', backref='request', lazy=True, cascade='all, delete-orphan'
    )


class Comment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    request_id = db.Column(
        db.Integer, db.ForeignKey('rescue_request.id'), nullable=False
    )
    team_name = db.Column(db.String(100), nullable=False)
    text = db.Column(db.Text, nullable=False)
    is_team = db.Column(db.Integer, default=0)
    timestamp = db.Column(db.String(100), nullable=False)


# Database မရှိသေးလျှင် အသစ်ဆောက်ပေးမည်
with app.app_context():
    db.create_all()


# --- Routes ---


# Home Page (Main Dashboard)
@app.route('/')
def home():
    requests = RescueRequest.query.order_by(RescueRequest.id.desc()).all()
    total_req = RescueRequest.query.count()
    high_urgency = RescueRequest.query.filter_by(urgency='High').count()
    resolved_count = RescueRequest.query.filter_by(status='Resolved').count()

    for req in requests:
        try:
            req.reaction_counts = json.loads(req.reactions)
        except Exception:
            req.reaction_counts = {"like": 0, "love": 0, "care": 0, "haha": 0}

    return render_template(
        'index.html',
        requests=requests,
        total_req=total_req,
        high_urgency=high_urgency,
        resolved_count=resolved_count,
    )


# Contact Page
@app.route('/contact')
def contact():
    return render_template('contact.html')


# Add New Rescue Request Route
@app.route('/add_request', methods=['POST'])
def add_request():
    name = request.form.get('name')
    phone = request.form.get('phone')
    people_count = request.form.get('people_count')
    location = request.form.get('location')
    urgency = request.form.get('urgency')
    message = request.form.get('message')
    timestamp = datetime.now().strftime('%Y-%m-%d %I:%M %p')

    image_filename = None
    if 'image' in request.files:
        file = request.files['image']
        if file and file.filename != '':
            filename = secure_filename(file.filename)
            image_filename = (
                f"{datetime.now().strftime('%Y%m%d%H%M%S')}_{filename}"
            )
            file.save(
                os.path.join(app.config['UPLOAD_FOLDER'], image_filename)
            )

    initial_reactions = json.dumps(
        {"like": 0, "love": 0, "care": 0, "haha": 0}
    )

    new_req = RescueRequest(
        name=name,
        phone=phone,
        people_count=people_count,
        location=location,
        urgency=urgency,
        message=message,
        timestamp=timestamp,
        image_filename=image_filename,
        reactions=initial_reactions,
    )
    db.session.add(new_req)
    db.session.commit()
    return redirect(url_for('home') + '#reports')


# Reaction Handler Route
@app.route('/react/<int:req_id>/<string:reaction_type>', methods=['POST'])
def react_request(req_id, reaction_type):
    req = RescueRequest.query.get_or_404(req_id)

    react_posts = session.get('react_posts', {})
    if not isinstance(react_posts, dict):
        react_posts = {}

    try:
        counts = (
            json.loads(req.reactions)
            if req.reactions
            else {"like": 0, "love": 0, "care": 0, "haha": 0}
        )
    except Exception:
        counts = {"like": 0, "love": 0, "care": 0, "haha": 0}

    current_user_reaction = react_posts.get(str(req_id))

    if current_user_reaction == reaction_type:
        if reaction_type in counts and counts[reaction_type] > 0:
            counts[reaction_type] -= 1
        react_posts.pop(str(req_id), None)
    else:
        if current_user_reaction and current_user_reaction in counts:
            if counts[current_user_reaction] > 0:
                counts[current_user_reaction] -= 1

        if reaction_type in counts:
            counts[reaction_type] += 1
        else:
            counts[reaction_type] = 1

        react_posts[str(req_id)] = reaction_type

    req.reactions = json.dumps(counts)
    session['react_posts'] = react_posts
    db.session.commit()

    return redirect(url_for('home') + '#reports')


# Status Update Route
@app.route('/update_status/<int:req_id>', methods=['POST'])
def update_status(req_id):
    new_status = request.form.get('status')
    rescue_key = request.form.get('rescue_key')

    if rescue_key == '1234' or len(rescue_key) > 0:
        req = RescueRequest.query.get_or_404(req_id)
        req.status = new_status
        db.session.commit()
    else:
        flash('Invalid Team Key!', 'danger')

    return redirect(url_for('home') + '#reports')


# Add Comment Route
@app.route('/add_comment/<int:req_id>', methods=['POST'])
def add_comment(req_id):
    team_name = request.form.get('team_name')
    comment_text = request.form.get('comment_text')
    is_team = int(request.form.get('is_team', 0))
    timestamp = datetime.now().strftime('%Y-%m-%d %I:%M %p')

    new_comm = Comment(
        request_id=req_id,
        team_name=team_name,
        text=comment_text,
        is_team=is_team,
        timestamp=timestamp,
    )
    db.session.add(new_comm)
    db.session.commit()
    return redirect(url_for('home') + '#reports')


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)