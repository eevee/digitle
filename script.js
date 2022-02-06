// thanks, https://stackoverflow.com/a/47593316/17875
// string hash function
function xmur3(str) {
    for(var i = 0, h = 1779033703 ^ str.length; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = h << 13 | h >>> 19;
    } return function() {
        h = Math.imul(h ^ (h >>> 16), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        return (h ^= h >>> 16) >>> 0;
    }
}
// simple PRNG, seeded by an integer
function mulberry32(a) {
    return function() {
        let t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

export class RNG {
    constructor(seed) {
        if (seed === undefined) {
            seed = Date.now();
        }
        if (typeof seed !== 'number') {
            seed = xmur3(String(seed))();
        }
        this.seed = seed;
        this.faucet = mulberry32(seed);
    }

    // This is the Python random module interface, which is the pinnacle of RNG interfaces
    random() {
        return this.faucet();
    }

    randrange(a, b) {
        if (b === undefined) {
            b = a;
            a = 0;
        }
        return a + Math.floor((b - a) * this.random());
    }

    choice(seq) {
        return seq[Math.floor(this.random() * seq.length)];
    }

    sample(seq, k) {
        let pool = Array.from(seq);
        let n = pool.length;
        let ret = [];
        for (let i = 0; i < k; i++) {
            let j = this.randrange(n - i);
            ret.push(pool[j]);
            pool[j] = pool[n - i - 1];
        }
        return ret;
    }
}


function _mk(el, children) {
    if (children.length > 0) {
        if (!(children[0] instanceof Node) && children[0] !== undefined && typeof(children[0]) !== "string" && typeof(children[0]) !== "number") {
            let [attrs] = children.splice(0, 1);
            for (let [key, value] of Object.entries(attrs)) {
                el.setAttribute(key, value);
            }
        }
        el.append(...children);
    }
    return el;
}

export function mk(tag_selector, ...children) {
    let [tag, ...classes] = tag_selector.split('.');
    let el = document.createElement(tag);
    if (classes.length > 0) {
        el.classList = classes.join(' ');
    }
    return _mk(el, children);
}


const BIG_NUMBERS = [25, 50, 75, 100];
const SMALL_NUMBERS = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10];
export class Game {
    constructor(rng) {
        this.rng = rng ?? new RNG;
        this.target = this.rng.randrange(100, 1000);
        // How many bigguns?
        let big;
        let n = this.rng.random();
        if (n < 0.5) {
            big = 1;
        }
        else if (n < 0.8) {
            big = 2;
        }
        else if (n < 0.9) {
            big = 3;
        }
        else if (n < 0.95) {
            big = 4;
        }
        else {
            big = 0;
        }

        this.numbers = [];
        this.numbers.push(...this.rng.sample(BIG_NUMBERS, big));
        this.numbers.push(...this.rng.sample(SMALL_NUMBERS, 6 - big));

        this.used = [];
        this.reset();
    }

    reset() {
        this.numbers.splice(6);
        this.used = [false, false, false, false, false, false];
        this.win = null;
    }

    check_for_win() {
        let closest = null;
        let closest_off = null;
        for (let [i, n] of this.numbers.entries()) {
            if (this.used[i])
                continue;

            let off = Math.abs(n - this.target);
            if (closest === null || off < closest_off) {
                closest = i;
                closest_off = off;
            }
        }

        if (closest_off > 10) {
            this.win = null;
            return;
        }

        this.win = {
            closest: this.numbers[closest],
            index: closest,
            off: closest_off,
            stars: 1,
        };
        if (closest_off === 0) {
            this.win.stars = 3;
        }
        else if (closest_off <= 5) {
            this.win.stars = 2;
        }

        return this.win;
    }
}


const OPERATORS = {
    '+': {
        text: '+',
        emoji: '➕',
        evaluate: (a, b) => a + b,
    },
    '-': {
        text: '−',
        emoji: '➖',
        evaluate: (a, b) => a - b,
    },
    '*': {
        text: '×',
        emoji: '✖️',
        evaluate: (a, b) => a * b,
    },
    '/': {
        text: '÷',
        emoji: '➗',
        evaluate: (a, b) => a / b,
    },
};
class IntegerError extends RangeError {}
class Expression {
    constructor(game, parent_el) {
        this.game = game;
        this.expn_el = mk('div.-expn');
        this.result_el = mk('div.-eq');
        parent_el.append(this.expn_el, this.result_el);

        this.parts = [];  // alternates between numbers and ops
        this.add_number();

        this.error = null;
    }

    add_number() {
        let element = mk('span.num.-pending');
        this.expn_el.append(element);
        this.pending_part = {
            value: 0,
            element,
        };
        this.parts.push(this.pending_part);
    }

    set_pending_number(n) {
        if (! this.pending_part)
            return;

        this.pending_part.value = n;
        this.pending_part.element.textContent = n ? String(n) : NBSP;
    }

    evaluate() {
        let parts = this.parts.map(part => part.value);

        // Perform multiplication and division
        let i = 1;
        while (i < parts.length) {
            if (parts[i] === '*') {
                parts.splice(i - 1, 3, parts[i - 1] * parts[i + 1]);
            }
            else if (parts[i] === '/') {
                let result = parts[i - 1] / parts[i + 1];
                if (result !== Math.floor(result)) {
                    throw new IntegerError(`Fractions are not allowed`);
                }
                parts.splice(i - 1, 3, result);
            }
            else {
                i += 2;
            }
        }
        // Perform addition and subtraction
        i = 1;
        while (i < parts.length) {
            if (parts[i] === '+') {
                parts.splice(i - 1, 3, parts[i - 1] + parts[i + 1]);
            }
            else if (parts[i] === '-') {
                let result = parts[i - 1] - parts[i + 1];
                if (result < 0) {
                    throw new IntegerError(`Negative values are not allowed`);
                }
                parts.splice(i - 1, 3, result);
            }
            else {
                i += 2;
            }
        }

        if (parts.length !== 1) {
            console.error("Didn't end up with 1 part left", parts);
        }

        return parts[0];
    }

    commit_number(index = null) {
        this.uncommit_number();

        let {value, element} = this.pending_part;
        element.classList.remove('-pending');

        // Double-check that the index matches our number
        if (index !== null && this.game.numbers[index] !== value) {
            index = null;
        }

        // Find the first matching number
        if (index === null) {
            for (let [j, n] of this.game.numbers.entries()) {
                if (n === value && ! this.game.used[j] &&
                    ! this.parts.some(part => part.index === j))
                {
                    index = j;
                    break;
                }
            }
        }

        if (index !== null) {
            if (index >= 6) {
                element.classList.add('intermed');
            }
            this.pending_part.index = index;
            return true;
        }
        else {
            element.classList.add('-error');
            this.error = `No ${value} is available`;
            return false;
        }
    }

    uncommit_number() {
        this.pending_part.index = null;
        let element = this.pending_part.element;
        element.classList.remove('-error', 'intermed', 'used');
        element.classList.add('-pending');
        this.error = null;
    }

    is_empty() {
        return this.parts.length === 1 && this.pending_part.value === 0;
    }

    // User input API

    append_digit(digit) {
        this.set_pending_number(this.pending_part.value * 10 + digit);
        this.uncommit_number();
    }

    set_number_by_index(index) {
        this.set_pending_number(this.game.numbers[index]);
        this.commit_number(index);
    }

    add_operator(op) {
        let opdef = OPERATORS[op];
        if (! opdef)
            return;

        if (this.pending_part.value === 0) {
            // No number; try to prefill the result of the last expression
            if (this.game.numbers.length > 6) {
                this.set_pending_number(this.game.numbers[this.game.numbers.length - 1]);
            }
            else {
                return;
            }
        }
        
        if (! this.commit_number())
            return;

        let element = mk('span.op', opdef.text);
        this.parts.push({ value: op, element });
        this.expn_el.append(element);

        this.add_number();
        return true;
    }

    backspace() {
        if (this.pending_part.value === 0) {
            // Erase the previous operator, if any (if none, do nothing)
            if (this.parts.length > 1) {
                this.parts.pop().element.remove();  // number
                this.parts.pop().element.remove();  // operator
                this.pending_part = this.parts[this.parts.length - 1];
                // Don't uncommit the number yet, for consistency with click entry
            }
        }
        else {
            // Delete the last digit of the current number
            this.set_pending_number(Math.floor(this.pending_part.value / 10));
            this.uncommit_number();
        }
    }

    commit() {
        if (this.pending_part.value === 0) {
            // Can't be done with no number
            return;
        }
        if (this.parts.length < 3) {
            // Need to have an expression to evaluate
            return;
        }

        if (! this.commit_number())
            return;

        let result;
        try {
            result = this.evaluate();
        }
        catch (e) {
            if (e instanceof IntegerError) {
                this.uncommit_number();
                this.error = e.message;
                return;
            }
            throw e;
        }

        let element = mk('span.num.intermed', result);
        this.result_el.append(
            mk('span.op', "="),
            element,
        );

        let used = [];
        for (let [i, part] of this.parts.entries()) {
            if (i % 2 === 0) {
                used.push(part.index);
            }
        }

        return {
            value: result,
            used,
            element,
        };
    }

    uncommit() {
        this.result_el.textContent = '';
    }
}

const NBSP = "\xa0";
export class UI {
    constructor(root) {
        this.root = root;

        this.target_el = root.querySelector('#board .num.target');
        this.givens_el = root.querySelector('#given');
        this.expns_el = root.querySelector('#inputs');
        this.error_el = root.querySelector('#error');

        this.number_els = [];
        for (let i = 0; i < 6; i++) {
            let el = mk('li.num', {'data-index': i}, "?");
            this.number_els.push(el);
            this.givens_el.append(el);
        }

        this.expressions = [];
        this.current_expn = null;

        // Handle clicks on available numbers
        this.root.addEventListener('click', ev => {
            let num = ev.target.closest('.num[data-index]');
            if (! num)
                return;

            this.input_number(parseInt(num.getAttribute('data-index')));
        });

        // Handle keypresses
        // TODO make it clear when we have focus?
        document.body.addEventListener('keydown', ev => {
            if ('0123456789'.indexOf(ev.key) >= 0) {
                this.input_digit(parseInt(ev.key, 10));
            }
            else if (ev.key === '+' || ev.key === '-' || ev.key === '*' || ev.key === '/') {
                // TODO would be nice to be able to do this and automatically bring down the result from the previous line
                this.input_operator(ev.key);
            }
            else if (ev.key === ':') {
                // Firefox nicety
                this.input_operator('/');
            }
            else if (ev.key === '=' || ev.key === 'Enter' || ev.key === 'Return') {
                this.input_done();
            }
            else if (ev.key === 'Backspace') {
                this.input_backspace();
            }
            else {
                return;
            }

            ev.preventDefault();
        });

        // Wire up the keyboard
        this.root.querySelector('#keyboard').addEventListener('click', ev => {
            let button = ev.target;
            if (button.tagName !== 'BUTTON')
                return;

            let type = button.getAttribute('data-type');
            if (type === 'digit') {
                this.input_digit(parseInt(button.getAttribute('data-digit'), 10));
            }
            else if (type === 'operator') {
                this.input_operator(button.getAttribute('data-op'));
            }
            else if (type === 'erase') {
                this.input_backspace();
            }
            else if (type === 'done') {
                this.input_done();
            }
        });

        this.root.querySelector('#button-reset').addEventListener('click', () => {
            this.reset();
        });

        this.mode_button = this.root.querySelector('#button-mode');
        this.mode_button.addEventListener('click', () => {
            if (this.daily_mode) {
                this.switch_to_random_mode();
            }
            else {
                this.switch_to_daily_mode();
            }
        });

        this.root.querySelector('#button-copy-results').addEventListener('click', ev => {
            this.copy_results().then(() => {
                this.confirm_copy(ev);
            });
        });

        // Set up tabs (which are outside the root oops)
        this.root.querySelector('#button-show-about').addEventListener('click', () => {
            this.switch_to_tab('main-about');
        });
        document.querySelector('#button-close-about').addEventListener('click', () => {
            this.switch_to_tab('main-game');
        });
        this.root.querySelector('#button-settings').addEventListener('click', () => {
            this.switch_to_tab('main-settings');
        });
        document.querySelector('#button-close-settings').addEventListener('click', () => {
            this.switch_to_tab('main-game');
        });

        // Default to today's game
        this.switch_to_daily_mode();
    }

    switch_to_tab(id) {
        for (let el of document.querySelectorAll('main')) {
            el.setAttribute('hidden', '');
        }
        document.querySelector('#' + id).removeAttribute('hidden');
    }

    switch_to_daily_mode() {
        this.daily_mode = true;
        this.mode_button.textContent = "📆";
        this.mode_button.setAttribute('title', "Daily");

        let date_seed = new Date().toISOString().substring(0, 10);  // yyyy-mm-dd
        this.daily_date = date_seed;
        this.daily_number = 1;
        this.set_game(new Game(new RNG(date_seed)));
    }

    switch_to_random_mode() {
        this.daily_mode = false;
        this.mode_button.textContent = "🎲";
        this.mode_button.setAttribute('title', "Random");

        this.set_game(new Game);
    }

    set_game(game) {
        this.game = game;
        this.target_el.textContent = this.game.target;
        for (let [i, n] of this.game.numbers.entries()) {
            this.number_els[i].textContent = n;
        }

        this.reset();
    }

    reset() {
        this.game.reset();

        this.root.classList.remove('won');
        this.expns_el.textContent = '';
        this.expressions = [];
        this.add_new_expression();
        this.number_els.splice(6);
        for (let el of this.givens_el.querySelectorAll('.num.used')) {
            el.classList.remove('used');
        }
        this.update_ui();
    }

    add_new_expression() {
        this.current_expn = new Expression(this.game, this.expns_el);
        this.expressions.push(this.current_expn);
    }

    update_ui() {
        // Scroll the expression list to the bottom
        this.expns_el.parentNode.scrollTo(0, this.expns_el.parentNode.scrollHeight);

        // Update the error + win elements
        if (this.current_expn && this.current_expn.error) {
            this.error_el.textContent = this.current_expn.error;
            this.root.classList.remove('won');
        }
        else {
            // If all is well, check for a win
            let win = this.game.check_for_win();
            this.root.classList.toggle('won', !!win);
            if (win) {
                let element = this.root.querySelector('#win-message');
                if (win.stars === 3) {
                    element.textContent = `Bang on!  ⭐⭐⭐`;
                }
                else {
                    element.textContent = `${win.off} away!  ` + "⭐".repeat(win.stars);
                }
            }
        }
    }

    input_digit(digit) {
        if (! this.current_expn)
            return;
        this.current_expn.append_digit(digit);
        this.update_ui();
    }

    input_number(index) {
        if (! this.current_expn)
            return;
        this.current_expn.set_number_by_index(index);
        this.update_ui();
    }

    input_operator(op) {
        if (! this.current_expn)
            return;
        this.current_expn.add_operator(op);
        this.update_ui();
    }

    input_backspace() {
        if (! this.current_expn || this.current_expn.is_empty()) {
            if (this.expressions.length > 1 ||
                (! this.current_expn && this.expressions.length >= 1))
            {
                // Delete the current one's DOM
                if (this.current_expn) {
                    this.current_expn.expn_el.remove();
                    this.current_expn.result_el.remove();
                    this.expressions.pop();
                }

                // Scrap it and make the previous one 'current'
                this.current_expn = this.expressions[this.expressions.length - 1];

                // Uncommit the previous one
                this.current_expn.uncommit();
                // Mark its numbers as no longer used
                for (let [i, part] of this.current_expn.parts.entries()) {
                    if (i % 2 === 0) {
                        this.game.used[part.index] = false;
                        this.number_els[part.index].classList.remove('used');
                    }
                }
                // Remove everything
                this.game.numbers.pop();
                this.game.used.pop();
                this.number_els.pop();
            }
        }
        else {
            this.current_expn.backspace();
        }

        this.update_ui();
    }

    input_done() {
        if (! this.current_expn)
            return;

        let result = this.current_expn.commit();
        if (result) {
            this.game.numbers.push(result.value);
            this.game.used.push(false);

            this.number_els.push(result.element);
            result.element.setAttribute('data-index', this.game.numbers.length - 1);

            let off = Math.abs(result.value - this.game.target);
            if (off === 0) {
                result.element.classList.add('win3');
            }
            else if (off <= 5) {
                result.element.classList.add('win2');
            }
            else if (off <= 10) {
                result.element.classList.add('win1');
            }

            for (let index of result.used) {
                this.game.used[index] = true;
                this.number_els[index].classList.add('used');
            }

            // Add a new expression only if at least 2 unused numbers remain
            if (this.game.used.filter(x => ! x).length >= 2) {
                this.add_new_expression();
            }
            else {
                this.current_expn = null;
            }
        }
        this.update_ui();
    }

    copy_results() {
        if (! this.game.win)
            return;

        let text = [];

        if (this.daily_mode) {
            text.push(`daily digitle ${this.daily_date}`);
            // TODO this.daily_number = 1;
        }
        else {
            // TODO
            text.push(`random digitle`);
        }
        text.push("\n");

        for (let expn of this.expressions) {
            if (expn === this.current_expn)
                // Still pending, ignore it
                continue;

            for (let [i, part] of expn.parts.entries()) {
                if (i % 2 === 0) {
                    if (part.index < 6) {
                        text.push("🟦");
                    }
                    else {
                        text.push("🟨");
                    }
                }
                else {
                    text.push(OPERATORS[part.value].emoji);
                }
            }
            text.push("\n");
        }

        // TODO indicate all numbers used?  hm
        text.push("⭐".repeat(this.game.win.stars));
        text.push("  ");
        if (this.game.win.off === 0) {
            text.push("perfect!");
        }
        else {
            text.push(`${this.game.win.off} away`);
        }

        return navigator.clipboard.writeText(text.join(""));
    }

    confirm_copy(ev) {
        let clipboard = mk('div.clipboard-confirm', "📋");
        clipboard.style.left = `${ev.clientX}px`;
        clipboard.style.top = `${ev.clientY}px`;
        document.body.append(clipboard);
        setTimeout(() => clipboard.remove(), 1000);
    }
}

// TODO:
// - figure out a way to accept a partial answer
//   - obviously if you hit the target, you win immediately (unless on "hard mode" where you must use every number)
//   - if you run out of numbers and your last one is within X, accept that?  (eh but, you might want to backspace and try again)
// - default to daily, but add random twiddles
//   - hard mode: must use every number
//   - big number pool: normal (25s), hard (12, 37, 62, 87), awkward (gross primes: 17, 43, 71, 89), chaos (anything from 11-100)
//   - force count of big numbers
//   - do it in other bases??
// - store prefs
// - remember streak, score?
// - fragment trick
// - limit intermediate results to 5 digits
// - hide last expression and ignore input when only one number is left
