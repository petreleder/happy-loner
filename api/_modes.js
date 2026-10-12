// Board maps — must match MODES in index.html.
// ' ' off-board, 'o' peg, '.' empty hole, 'x' rock, '*' empty target, '@' target with peg
module.exports = {
  classic: ['  ooo  ', ' ooooo ', 'ooooooo', 'ooo.ooo', 'ooooooo', ' ooooo ', '  ooo  '],
  cross:   ['  ooo  ', '  ooo  ', 'ooooooo', 'ooo*ooo', 'ooooooo', '  ooo  ', '  ooo  '],
  rocks:   [' oooo ', 'ooxooo', 'oooooo', 'oo.ooo', 'oooooo', 'oooxoo', ' oooo '],
  diamond: ['    o    ', '   ooo   ', '  oo.oo  ', ' xooooox ', 'ooooooooo', ' xooooox ', '  ooooo  ', '   ooo   ', '    o    '],
};
