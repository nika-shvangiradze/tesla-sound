export type Coordinates = [longitude: number, latitude: number];
export type MapPlace = { label: string; point: Coordinates; googleDestination?: string };
export type DrivingRoute = { points: Coordinates[]; distance: number; duration: number };

export function isCoordinates(value: unknown): value is Coordinates {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite)
    && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90;
}

const PLACES: { ka: string; en: string; point: Coordinates; airportCode?: string }[] = [
  { ka: 'თბილისი', en: 'Tbilisi', point: [44.8015, 41.6938] },
  { ka: 'ბათუმი', en: 'Batumi', point: [41.6367, 41.6509] },
  { ka: 'ქუთაისი', en: 'Kutaisi', point: [42.704, 42.2679] },
  { ka: 'რუსთავი', en: 'Rustavi', point: [44.9932, 41.5486] },
  { ka: 'გორი', en: 'Gori', point: [44.1146, 41.9855] },
  { ka: 'ზუგდიდი', en: 'Zugdidi', point: [41.8709, 42.5088] },
  { ka: 'ფოთი', en: 'Poti', point: [41.6719, 42.1462] },
  { ka: 'თელავი', en: 'Telavi', point: [45.4736, 41.9198] },
  { ka: 'მცხეთა', en: 'Mtskheta', point: [44.7215, 41.8449] },
  { ka: 'ბორჯომი', en: 'Borjomi', point: [43.4128, 41.8389] },
  { ka: 'ახალციხე', en: 'Akhaltsikhe', point: [42.9862, 41.639] },
  { ka: 'მესტია', en: 'Mestia', point: [42.7248, 43.0443] },
  { ka: 'სტეფანწმინდა', en: 'Stepantsminda', point: [44.6417, 42.657] },
  // Passenger access points near the terminals, from OpenStreetMap.
  { ka: 'თბილისის საერთაშორისო აეროპორტი', en: 'Tbilisi International Airport', airportCode: 'TBS', point: [44.9648, 41.67115] },
  { ka: 'ქუთაისის საერთაშორისო აეროპორტი', en: 'Kutaisi International Airport', airportCode: 'KUT', point: [42.46552, 42.18247] },
  { ka: 'ბათუმის საერთაშორისო აეროპორტი', en: 'Batumi International Airport', airportCode: 'BUS', point: [41.61107, 41.60777] },
];
const AIRPORT_ALIASES = ['aeroporti', 'airport', 'airports', 'აეროპორტები'];

export function findGeorgianPlaces(query: string, language: 'en' | 'ka'): MapPlace[] {
  const term = query.trim().toLowerCase();
  if (!term) return [];
  const words = term.split(/\s+/);
  const exactAirport = PLACES.find((place) => place.airportCode?.toLowerCase() === term);
  const matches = exactAirport ? [exactAirport] : PLACES.filter(({ ka, en, airportCode }) => {
    const name = `${ka} ${en}`.toLowerCase();
    return words.every((word) => name.includes(word)
      || (airportCode && (word === airportCode.toLowerCase() || AIRPORT_ALIASES.includes(word))));
  });
  return matches.map((place) => ({
    label: place.airportCode ? `${place[language]} (${place.airportCode})` : place[language],
    point: place.point,
    ...(place.airportCode && { googleDestination: `${place.en}, Georgia (${place.airportCode})` }),
  }));
}

export function googleDirections(destination: Coordinates | string, origin?: Coordinates) {
  const params = new URLSearchParams({
    api: '1',
    travelmode: 'driving',
    destination: typeof destination === 'string' ? destination : [destination[1], destination[0]].join(','),
  });
  if (origin) params.set('origin', [origin[1], origin[0]].join(','));
  return 'https://www.google.com/maps/dir/?' + params.toString();
}

export function googlePlaceSearch(query: string) {
  const params = new URLSearchParams({ api: '1', query: `${query}, Georgia` });
  return 'https://www.google.com/maps/search/?' + params.toString();
}
