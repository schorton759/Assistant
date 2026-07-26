/**
 * Deep links into meta-search / airline sites with trip details prefilled.
 * Full airline checkout autofill isn't possible without partner booking APIs —
 * these open the right search with route, dates, and passenger mix already set.
 */

function countByType(ages = []) {
  const counts = { adults: 0, children: 0, infants: 0 };
  for (const age of ages) {
    const n = Number(age);
    if (!Number.isFinite(n) || n < 2) counts.infants += 1;
    else if (n < 12) counts.children += 1;
    else counts.adults += 1;
  }
  if (!ages.length) counts.adults = 1;
  if (counts.adults < 1 && (counts.children || counts.infants)) counts.adults = 1;
  return counts;
}

function yymmdd(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${y.slice(2)}${m}${d}`;
}

function googleFlightsUrl({ origin, destination, departDate, returnDate, ages }) {
  const { adults, children, infants } = countByType(ages);
  let q = `Flights from ${origin} to ${destination} on ${departDate}`;
  if (returnDate) q += ` returning ${returnDate}`;
  const bits = [];
  if (adults) bits.push(`${adults} adult${adults > 1 ? 's' : ''}`);
  if (children) bits.push(`${children} child${children > 1 ? 'ren' : ''}`);
  if (infants) bits.push(`${infants} infant${infants > 1 ? 's' : ''}`);
  if (bits.length) q += ` for ${bits.join(', ')}`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}`;
}

function kayakFlightsUrl({ origin, destination, departDate, returnDate, ages }) {
  const { adults, children, infants } = countByType(ages);
  let path = `https://www.kayak.com/flights/${origin}-${destination}/${departDate}`;
  if (returnDate) path += `/${returnDate}`;
  const params = new URLSearchParams();
  params.set('sort', 'bestflight_a');
  params.set('adults', String(Math.max(1, adults)));
  if (children) params.set('children', String(children));
  if (infants) params.set('infantLap', String(infants));
  return `${path}?${params.toString()}`;
}

function skyscannerFlightsUrl({ origin, destination, departDate, returnDate, ages }) {
  const { adults, children, infants } = countByType(ages);
  let path = `https://www.skyscanner.net/transport/flights/${origin.toLowerCase()}/${destination.toLowerCase()}/${yymmdd(departDate)}/`;
  if (returnDate) path += `${yymmdd(returnDate)}/`;
  const params = new URLSearchParams({
    adults: String(Math.max(1, adults)),
    adultsv2: String(Math.max(1, adults)),
    children: String(children || 0),
    infants: String(infants || 0),
    cabinclass: 'economy',
    rtn: returnDate ? '1' : '0',
  });
  return `${path}?${params.toString()}`;
}

const AIRLINE_BOOK_URLS = {
  BA: ({ origin, destination, departDate, returnDate }) => {
    const params = new URLSearchParams({
      eId: '106087',
      from: origin,
      to: destination,
      depDate: departDate,
    });
    if (returnDate) params.set('retDate', returnDate);
    return `https://www.britishairways.com/travel/book/public/en_us?${params.toString()}`;
  },
  AA: ({ origin, destination, departDate, returnDate }) => {
    let url = `https://www.aa.com/booking/find-flights?origin=${origin}&destination=${destination}&departureDate=${departDate}`;
    if (returnDate) url += `&returnDate=${returnDate}`;
    return url;
  },
  UA: ({ origin, destination, departDate }) =>
    `https://www.united.com/en/us/fsr/choose-flights?f=${origin}&t=${destination}&d=${departDate}`,
  DL: ({ origin, destination, departDate, returnDate }) => {
    let url = `https://www.delta.com/flightsearch/book-a-flight?originCity=${origin}&destinationCity=${destination}&departureDate=${departDate}`;
    if (returnDate) url += `&returnDate=${returnDate}`;
    return url;
  },
  B6: ({ origin, destination, departDate, returnDate }) => {
    let url = `https://www.jetblue.com/booking/flights?from=${origin}&to=${destination}&depart=${departDate}`;
    if (returnDate) url += `&return=${returnDate}`;
    return url;
  },
  VS: () => 'https://www.virginatlantic.com/book/flights',
  AF: () => 'https://wwws.airfrance.us/search/offers',
  LH: () => 'https://www.lufthansa.com/us/en/homepage',
  AC: ({ origin, destination, departDate }) =>
    `https://www.aircanada.com/aeroplan/redeem/availability/outbound?org0=${origin}&dest0=${destination}&departureDate0=${departDate}`,
  EK: () => 'https://www.emirates.com/us/english/book/',
  QR: () => 'https://www.qatarairways.com/en-us/homepage.html',
};

function airlineBookUrl(offer, brief) {
  const code = offer.segments?.[0]?.airline || Object.keys(AIRLINE_BOOK_URLS).find((c) =>
    (offer.airlines || []).some((n) => n.toLowerCase().includes(c.toLowerCase()))
  );
  // Prefer operating/marketing carrier from first segment
  const segCode = offer.segments?.[0]?.airline;
  const builder = AIRLINE_BOOK_URLS[segCode] || (code && AIRLINE_BOOK_URLS[code]);
  if (!builder) return null;
  try {
    return builder({
      origin: offer.origin,
      destination: offer.destination,
      departDate: offer.departDate || brief?.departDate,
      returnDate: offer.returnDate || brief?.returnDate,
      ages: offer.ages || brief?.ages,
    });
  } catch {
    return null;
  }
}

function buildFlightBookingLinks(offer, brief = {}) {
  const payload = {
    origin: offer.origin,
    destination: offer.destination,
    departDate: offer.departDate || brief.departDate,
    returnDate: offer.returnDate || brief.returnDate || null,
    ages: offer.ages || brief.ages || [],
  };

  const airlineName = offer.segments?.[0]?.airlineName || offer.airlines?.[0] || 'Airline';
  const airlineUrl = airlineBookUrl(offer, brief);

  const links = [
    {
      id: 'google-flights',
      label: 'Google Flights',
      blurb: 'Compare with your dates & travelers filled in',
      url: googleFlightsUrl(payload),
      primary: !airlineUrl && !offer.deepLink,
    },
    {
      id: 'kayak',
      label: 'Kayak',
      blurb: 'Open Kayak search with this itinerary',
      url: kayakFlightsUrl(payload),
      primary: false,
    },
    {
      id: 'skyscanner',
      label: 'Skyscanner',
      blurb: 'Skyscanner with passenger mix',
      url: skyscannerFlightsUrl(payload),
      primary: false,
    },
  ];

  if (airlineUrl) {
    links.unshift({
      id: 'airline',
      label: `Book on ${airlineName}`,
      blurb: 'Opens the airline with route & dates started — finish passenger details there',
      url: airlineUrl,
      primary: !offer.deepLink,
    });
  }

  // Live aggregator deeplink (Travelpayouts / Aviasales) — often the actual quoted fare
  if (offer.deepLink) {
    links.unshift({
      id: 'live-market',
      label: offer.gate ? `Book via ${offer.gate}` : 'Book this live fare',
      blurb: 'Opens the market offer that produced this price — confirm before paying',
      url: offer.deepLink,
      primary: true,
    });
    for (const link of links.slice(1)) link.primary = false;
  }

  return links;
}

function kayakCarsUrl({ location, pickupDate, dropoffDate }) {
  return `https://www.kayak.com/cars/${location}/${pickupDate}/${dropoffDate}`;
}

function googleCarsUrl({ location, pickupDate, dropoffDate }) {
  const q = `Car rental ${location} from ${pickupDate} to ${dropoffDate}`;
  return `https://www.google.com/travel/cars?q=${encodeURIComponent(q)}`;
}

const CAR_VENDOR_URLS = {
  Enterprise: ({ location }) =>
    `https://www.enterprise.com/en/home.html#search:${encodeURIComponent(location)}`,
  Hertz: ({ location }) =>
    `https://www.hertz.com/rentacar/reservation/?keyword=${encodeURIComponent(location)}`,
  Sixt: ({ location, pickupDate, dropoffDate }) =>
    `https://www.sixt.com/php/reservation/offerlist?liso=${encodeURIComponent(location)}&pickup_date=${pickupDate}&return_date=${dropoffDate}`,
  Avis: ({ location }) =>
    `https://www.avis.com/en/home#/search/${encodeURIComponent(location)}`,
  Budget: ({ location }) =>
    `https://www.budget.com/en/home#/search/${encodeURIComponent(location)}`,
};

function buildCarBookingLinks(offer) {
  const payload = {
    location: offer.locationCode || offer.location,
    pickupDate: offer.pickupDate,
    dropoffDate: offer.dropoffDate,
  };
  const links = [
    {
      id: 'kayak-cars',
      label: 'Kayak Cars',
      blurb: 'Search cars with pickup & dates filled in',
      url: kayakCarsUrl(payload),
      primary: true,
    },
    {
      id: 'google-cars',
      label: 'Google Cars',
      blurb: 'Compare nearby rental options',
      url: googleCarsUrl(payload),
      primary: false,
    },
  ];
  const vendor = offer.vendor;
  if (vendor && CAR_VENDOR_URLS[vendor]) {
    links.unshift({
      id: 'vendor',
      label: `Book on ${vendor}`,
      blurb: 'Opens the rental brand — confirm times & driver details there',
      url: CAR_VENDOR_URLS[vendor](payload),
      primary: true,
    });
    // Kayak stays useful but not primary
    links[1].primary = false;
  }
  return links;
}

module.exports = {
  buildFlightBookingLinks,
  buildCarBookingLinks,
  countByType,
  googleFlightsUrl,
  kayakFlightsUrl,
};
