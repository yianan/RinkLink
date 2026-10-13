"""Reference postcodes carried forward from the full app's local distance dataset."""
from ..models import ZipCode

ZIP_REFERENCE = [
    ('60091', 'Wilmette', 'IL', 42.0764, -87.7229),
    ('60106', 'Bensenville', 'IL', 41.9553, -87.9401),
    ('60134', 'Geneva', 'IL', 41.8872, -88.3054),
    ('60025', 'Glenview', 'IL', 42.0698, -87.7878),
    ('60062', 'Northbrook', 'IL', 42.1275, -87.8290),
    ('60035', 'Highland Park', 'IL', 42.1817, -87.8003),
    ('60201', 'Evanston', 'IL', 42.0565, -87.6942),
    ('60540', 'Naperville', 'IL', 41.7750, -88.1487),
    ('60302', 'Oak Park', 'IL', 41.8946, -87.7892),
    ('60173', 'Schaumburg', 'IL', 42.0629, -88.1227),
    ('60440', 'Bolingbrook', 'IL', 41.6986, -88.0684),
    ('60462', 'Orland Park', 'IL', 41.6303, -87.8539),
]


def ensure_zip_reference(db):
    for zipcode, city, state, lat, lon in ZIP_REFERENCE:
        if not db.get(ZipCode, zipcode):
            db.add(ZipCode(zip_code=zipcode, city=city, state=state, latitude=lat, longitude=lon))
    db.commit()
