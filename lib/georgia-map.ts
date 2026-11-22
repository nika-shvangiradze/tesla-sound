export type Coordinates = [longitude: number, latitude: number];
export type MapPlace = { label: string; point: Coordinates };
export type DrivingRoute = { points: Coordinates[]; distance: number; duration: number };

export function isCoordinates(value: unknown): value is Coordinates {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite)
    && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90;
}

const CITIES: { ka: string; en: string; point: Coordinates }[] = [
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
];

export function findGeorgianCities(query: string, language: 'en' | 'ka'): MapPlace[] {
  const term = query.trim().toLowerCase();
  if (!term) return [];
  return CITIES.filter(({ ka, en }) => ka.includes(term) || en.toLowerCase().includes(term))
    .map((city) => ({ label: city[language], point: city.point }));
}

export function googleDirections(destination: Coordinates, origin?: Coordinates) {
  const params = new URLSearchParams({
    api: '1',
    travelmode: 'driving',
    destination: [destination[1], destination[0]].join(','),
  });
  if (origin) params.set('origin', [origin[1], origin[0]].join(','));
  return 'https://www.google.com/maps/dir/?' + params.toString();
}
