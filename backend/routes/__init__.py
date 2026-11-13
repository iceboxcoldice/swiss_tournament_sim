from routes import events, judges, requests, teams_coaches, tournaments, users

ALL_BLUEPRINTS = [
    tournaments.bp,
    judges.bp,
    teams_coaches.bp,
    requests.bp,
    events.bp,
    users.bp,
]


def register_blueprints(app):
    for bp in ALL_BLUEPRINTS:
        app.register_blueprint(bp)
