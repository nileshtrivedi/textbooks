// =============================================================================
// Dot Machine Component
// (c) Mathigon
// =============================================================================


import {defer, EventTarget, last} from '@mathigon/core';
import {numberFormat} from '@mathigon/fermat';
import {Point} from '@mathigon/euclid';
import {Expression} from '@mathigon/hilbert';
import {$N, AudioPlayer, CustomElementView, ElementView, pointerPosition, register} from '@mathigon/boost';


const enterAudio = new AudioPlayer('/audio/appear.mp3');
const explodeAudio = new AudioPlayer('/audio/whoosh.mp3');
const annihilateAudio = new AudioPlayer('/audio/disappear.mp3');

// -----------------------------------------------------------------------------

class Cell extends EventTarget {
  $el: ElementView;
  $dots: ElementView[] = [];
  $value: ElementView;
  $tools: ElementView[] = [];

  value: number;
  dotCols = 1;
  dotRows = 1;


  constructor(private readonly $dotMachine: DotMachine, initial = 0,
      index = 0) {
    super();
    this.value = initial;

    this.$el = $N('div', {class: 'dot-cell'}, $dotMachine.$wrap);
    this.$value = $N('div', {class: 'cell-value', html: initial}, this.$el);

    this.$tools = [
      $N('button', {class: 'add-dot', html: '🔵', title: 'add a dot'}, this.$el),
      $N('button', {class: 'add-antidot', html: '⭕️', title: 'add an antidot'}, this.$el),
      $N('button', {class: 'explode', html: '💥', title: 'explode'}, this.$el),
      $N('button', {class: 'annihilate', html: '⤫', title: 'annihilate'}, this.$el),
    ];

    this.$tools[0].on('click', (e) => {
      e.stopPropagation();
      this.addDot(undefined, {count: true});
    });

    this.$tools[1].on('click', (e) => {
      e.stopPropagation();
      this.addAntidot(undefined);
    });

    this.$tools[2].on('click', async (e) => {
      e.stopPropagation();
      await this.explode(false);
    });

    this.$tools[3].on('click', (e) => {
      e.stopPropagation();
      this.annihilate();
    });

    // TODO: We are showing max 5 digits for negative powers. 
    // This should use … instead for repeating decimals.
    // TODO: order value should be calculated from the rule?
    // const order = numberFormat(index > 0 ? Math.pow($dotMachine.base, index) :
    //                            1 / Math.pow($dotMachine.base, -index), 
    //                            index > 0 ? 10 : 5);  // Prevent rounding errors
    const order = Expression.parse(`${$dotMachine.base}^(${index})`).toMathML();

    $N('div', {class: 'cell-order', html: order}, this.$el);

    if (initial) {
      this.rearrange(initial);
      for (let i = 0; i < initial; ++i) this.addDot(undefined, {count: false});
    }
  }

  get $fullDots() {
    return this.$dots.filter($d => !$d.data.anti);
  }

  get $antiDots() {
    return this.$dots.filter($d => $d.data.anti);
  }

  getDotPosition(i: number) {
    const s = this.$dotMachine.spacing;
    const x = 60 - this.dotCols * s / 2 + (i % this.dotCols) * s;
    const y = 60 - this.dotRows * s / 2 + Math.floor(i / this.dotCols) * s;
    return new Point(x, y);
  }

  rearrange(useN?: number) {
    const n = this.$dots.length;
    this.dotCols = Math.ceil(Math.sqrt(useN || n));
    this.dotRows = Math.ceil((useN || n) / this.dotCols);

    this.$dots = [...this.$fullDots, ...this.$antiDots];

    for (let i = 0; i < n; ++i) {
      const p = this.getDotPosition(i);
      this.$dots[i].animate({transform: `translate(${p.x}px,${p.y}px)`}, 300,
          i * 20);
    }
  }

  addDot(posn?: Point,
      {className = '', dx = 0, audio = false, count = true} = {}) {
    if (!posn) posn = this.getDotPosition(this.$dots.length);
    //if (audio) enterAudio.play();

    const $dot = $N('div', {class: 'dot ' + className}, this.$el);
    this.$dots.push($dot);

    $dot.animate({
      transform: [`translate(${posn.x}px, ${posn.y}px) scale(0.1)`,
        `translate(${posn.x + dx}px, ${posn.y}px)`]
    }, 400, 0, 'bounce-in');

    if (count) {
      this.value += 1;
      this.$value.textStr = this.value;
    }

    setTimeout(() => this.rearrange(), 400);
    return $dot;
  }

  addAntidot(posn?: Point){
    const $antiDot = this.addDot(posn, {className: 'anti', dx: 10, count: false});
    $antiDot.data.anti = 'true';
    this.value -= 1;
    this.$value.textStr = this.value;
  }

  addDotAntidot(posn: Point) {
    this.addDot(posn, {dx: -10, audio: true, count: false});
    const $antiDot = this.addDot(posn,
        {className: 'anti', dx: 10, count: false});
    $antiDot.data.anti = 'true';
  }

  canExplode(): boolean {
    // console.log('checking canExplode()');
    let myIndex = this.$dotMachine.cells.indexOf(this);
    let from = this.$dotMachine.rule.from;
    let cells = this.$dotMachine.cells.slice(myIndex + 1 - from.length, myIndex+1);
    // check if explosion condition is satisfied
    return cells.every((c,i) => (from[i] < 0 ? c.$antiDots : c.$fullDots).length >= Math.abs(from[i]));
  }

  explode(recursive = false): Promise<void> {
    let myIndex = this.$dotMachine.cells.indexOf(this);
    let from = this.$dotMachine.rule.from;
    let to = this.$dotMachine.rule.to;
    let cells = this.$dotMachine.cells.slice(myIndex + 1 - from.length, myIndex+1);

    if (!this.canExplode()) return Promise.resolve();
    console.log('explode()', recursive, from, to, {myIndex});

    for (let [counter, cell] of cells.entries()){
      const $remove = (from[counter] < 0 ? cell.$antiDots : cell.$fullDots).slice(0, Math.abs(from[counter]));
      cell.$dots = from[counter] < 0 
                    ? [...cell.$fullDots, ...cell.$antiDots.slice(Math.abs(from[counter]))]
                    : [...cell.$antiDots, ...cell.$fullDots.slice(Math.abs(from[counter]))];
      
      for (const dot of $remove) dot.addClass('glowing');
      
      let nextIndex = this.$dotMachine.cells.indexOf(cell) - 1;
      console.log({nextIndex})
      let nextCell = this.$dotMachine.cells[nextIndex];
      let target = nextCell ? nextCell.getDotPosition(nextCell.$dots.length) : undefined;
      let transform = nextCell ? target!.add(nextCell.$el.topLeftPosition)
        .subtract(this.$el.topLeftPosition) : new Point(-54, 50);
      
      for (const dot of $remove) {
          dot.animate({transform: `translate(${transform.x}px,${transform.y}px) scale(2)`}, 400, 400)
              .promise.then(() => dot.remove());
      }

      setTimeout(() => this.rearrange(), 400);
      setTimeout(() => {
        console.log('creating', counter, to[counter]);
        console.log('adding dits', Math.abs(to[counter]));
        for (let i = 0; i < Math.abs(to[counter]); i++){
          let tg = cell.getDotPosition(cell.$dots.length)
          if(to[counter] < 0) cell.addAntidot(tg);
          else cell.addDot(tg, {count: true});
        }
        cell.value -= from[counter];
        cell.$value.textStr = cell.value;
      }, 800);
    }

    // setTimeout(() => explodeAudio.play(), 100);
    
    const deferred = defer();
    setTimeout(() => {
      const cell = (!this.canExplode()) ? this.$dotMachine.cells[myIndex - 1] : this;
      if (!recursive || !cell) return deferred.resolve();
      cell.explode(recursive).then(() => deferred.resolve());
    }, 1200);
    return deferred.promise;
  }

  annihilate() {
    const $fullDots = this.$fullDots;
    const $antiDots = this.$antiDots;

    const n = Math.min($fullDots.length, $antiDots.length);
    if (!n) return;

    for (let i = 0; i < n; ++i) {
      setTimeout(() => {
        $fullDots[i].addClass('warning');
        $fullDots[i].animate({transform: `translate(50px, 50px) scale(2)`}, 400, 400)
            .promise.then(() => $fullDots[i].exit('pop'));
        $antiDots[i].addClass('warning');
        $antiDots[i].animate({transform: `translate(50px, 50px) scale(2)`}, 400, 400)
            .promise.then(() => $antiDots[i].exit('pop'));
      }, i * 600);
      // setTimeout(() => annihilateAudio.play(), i * 600 + 500);
    }
  }

}

// -----------------------------------------------------------------------------

@register('x-dot-machine')
export class DotMachine extends CustomElementView {
  $wrap!: ElementView;
  base!: string;
  rule!: {from: number[], to: number[]};
  spacing!: number;
  cells: Cell[] = [];

  ready() {
    const cellString = (this.attr('cells') || '000');
    const cells = cellString.replaceAll('…', '').split('.');

    // this.base = (+this.attr('type') || 10);
    this.rule = JSON.parse(this.attr('rule')) || {from: [0,2], to: [1,0]};
    this.base = this.attr('base') || last(this.rule.from).toString(); // only works for rule.from = [0, n];

    this.spacing = this.hasClass('tiny') ? 14 : 20;

    this.$wrap = $N('div', {class: 'dot-wrap'}, this);
    if (cellString[0] === '…') $N('div', {class: 'dot-ellipses'}, this.$wrap);

    for (let i = 0; i < cells[0].length; ++i) {
      this.cells.push(new Cell(this, +cells[0][i], cells[0].length - 1 - i));
    }

    if (cells[1]) {
      $N('div', {class: 'dot-decimal'}, this.$wrap);
      for (let i = 0; i < cells[1].length; ++i) {
        this.cells.push(new Cell(this, +cells[1][i], -1 - i));
      }
    }

    if (cellString[cellString.length - 1] === '…') {
      $N('div', {class: 'dot-ellipses'}, this.$wrap);
    }

    this.cells.forEach((cell, i) => {
      cell.$el.on('click', (e) => {
        const point = pointerPosition(e).subtract(cell.$el.topLeftPosition);
        this.trigger('add', {i, point, cell});
      });
    });
  }

  explode() {
    return last(this.cells).explode(true);
  }
}
