import { describe, it, expect } from 'vitest';
import { placeProblems } from '../lib/imageAdvice';

const split = { ratio: '4:3', width: 1200, height: 900, cropUrl: 'u' };
const square = { ratio: '1:1', width: 1600, height: 1600, cropUrl: 'u' };
const free = { width: 2400, cropUrl: 'u' };
const MAX = 200 * 1024;

describe('placeProblems', () => {
  it('passes a right-sized, right-shaped, small image', () => {
    expect(placeProblems({ bytes: 150_000, width: 1200, height: 900 }, 'split', split, MAX)).toEqual([]);
    expect(placeProblems({ bytes: 150_000, width: 1300, height: 960 }, 'split', split, MAX)).toEqual([]); // within 5%
  });
  it('flags size over the limit, wrong ratio, too small, much too large', () => {
    expect(placeProblems({ bytes: 3_000_000, width: 1200, height: 900 }, 'split', split, MAX)).toHaveLength(1);
    expect(placeProblems({ bytes: 1, width: 1600, height: 900 }, 'split', split, MAX)[0]).toMatch(/crops/);
    expect(placeProblems({ bytes: 1, width: 1600, height: 900 }, 'productGallery', square, MAX)[0]).toMatch(
      /blank margins/,
    );
    expect(placeProblems({ bytes: 1, width: 800, height: 600 }, 'split', split, MAX)[0]).toMatch(/blurry/);
    expect(placeProblems({ bytes: 1, width: 4032, height: 3024 }, 'split', split, MAX)[0]).toMatch(/larger/);
  });
  it('any-ratio place only checks width (and bytes)', () => {
    expect(placeProblems({ bytes: 1, width: 2400, height: 9000 }, 'image', free, MAX)).toEqual([]);
    expect(placeProblems({ bytes: 1, width: 750, height: 9000 }, 'image', free, MAX)).toHaveLength(1);
  });
});
