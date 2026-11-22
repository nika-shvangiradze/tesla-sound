import assert from 'node:assert/strict';
import test from 'node:test';
import { findGeorgianPlaces, googleDirections, googlePlaceSearch } from '../lib/georgia-map.ts';

test('airport search accepts Georgian, English, transliteration, and IATA codes', () => {
  assert.equal(findGeorgianPlaces('აეროპორტი', 'ka').length, 3);
  assert.equal(findGeorgianPlaces('Airports', 'en').length, 3);
  assert.equal(findGeorgianPlaces('თბილისი აეროპორტი', 'ka')[0]?.label, 'თბილისის საერთაშორისო აეროპორტი (TBS)');
  assert.equal(findGeorgianPlaces('batumi aeroporti', 'en')[0]?.label, 'Batumi International Airport (BUS)');
  assert.equal(findGeorgianPlaces('KUT', 'en')[0]?.label, 'Kutaisi International Airport (KUT)');
  assert.equal(findGeorgianPlaces('უცნობი მისამართი', 'ka').length, 0);
});

test('Google Maps URLs retain both the selected starting point and destination', () => {
  const airport = findGeorgianPlaces('TBS', 'en')[0];
  const directions = new URL(googleDirections(airport.googleDestination ?? airport.point, [44.8, 41.69]));
  assert.equal(directions.origin, 'https://www.google.com');
  assert.equal(directions.searchParams.get('origin'), '41.69,44.8');
  assert.match(directions.searchParams.get('destination') ?? '', /Tbilisi International Airport.*TBS/);
  assert.equal(directions.searchParams.get('travelmode'), 'driving');

  const pin = new URL(googleDirections([44.95, 41.66], [44.81, 41.71]));
  assert.equal(pin.searchParams.get('origin'), '41.71,44.81');
  assert.equal(pin.searchParams.get('destination'), '41.66,44.95');
  assert.equal(new URL(googlePlaceSearch('რუსთაველის 20')).searchParams.get('query'), 'რუსთაველის 20, Georgia');
});
