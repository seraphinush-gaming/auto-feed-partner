'use strict';

const path = require('path');

class auto_pet {

  constructor(mod) {

    this.m = mod;
    this.c = mod.command;
    this.g = mod.game;
    this.s = mod.settings;
    this.hooks = [];

    // initialize
    this.feed_pet = false;
    this.food_interval = 0;
    this.hold_feeding = false;
    this.pet = BigInt(0);

    // set definition
    try {
      this.m.dispatch.addDefinition('C_REQUEST_SPAWN_SERVANT', 93, path.join(__dirname, 'def', 'C_REQUEST_SPAWN_SERVANT.93.def'), true);
      this.m.dispatch.addDefinition('C_REQUEST_DESPAWN_SERVANT', 93, path.join(__dirname, 'def', 'C_REQUEST_DESPAWN_SERVANT.93.def'), true);
    } catch {
      this.m.warn(`Error. could not add required definition(s).`);
    }

    // command
    this.c.add('pet', {
      '$none': () => {
        this.s.enable = !this.s.enable;
        this.s.enable ? this.load() : this.unload();
        this.send(`${this.s.enable ? 'En' : 'Dis'}abled`);
      },
      'set': (n) => {
        n = parseInt(n);
        if (!isNaN(n)) {
          this.s.interval = n;
          this.handle_interval();
          this.send(`Set pet feeding interval to ${n} minutes.`);
        } else {
          this.send(`Invalid argument. usage : pet set &lt;num&gt;`);
        }
      },
      '$default': () => { this.send(`Invalid argument. usage : pet [set]`); }
    });

    // game state
    this.g.on('enter_game', () => {
      if (this.s.enable) {
        this.m.hookOnce('S_SPAWN_ME', 'event', { order: 10 }, () => {
          this.s.pet[this.g.me.name] ? this.handle_spawn_pet() : null;
        });
      }
    });

    this.g.me.on('mount', () => {
      this.s.enable ? this.hold_feeding = true : null;
    });

    this.g.me.on('dismount', () => {
      if (this.s.enable) {
        this.hold_feeding = false;
        if (this.feed_pet) {
          this.handle_feed_pet();
          this.feed_pet = false;
        }
      }
    });

    this.s.enable ? this.load() : null;

  }

  destructor() {
    this.m.clearInterval(this.food_interval);
    this.c.remove('pet');
    this.unload();
  }

  // handler
  handle_interval() {
    this.m.clearInterval(this.food_interval);
    this.food_interval = this.m.setInterval(() => {
      if (!this.hold_feeding) {
        this.handle_feed_pet();
      }
      else {
        if (!this.feed_pet) {
          this.feed_pet = true;
        }
        else {
          this.m.clearInterval(this.food_interval);
          this.send(`Could not feed more than once, disabled feeding interval.`);
        }
      }
    }, (this.s.interval * 60 * 1000));
  }

  handle_spawn_pet() {
    let res = this.try_spawn_pet();
    this.m.clearInterval(this.food_interval);
    res ? this.send(`Spawning companion.`) : this.send(`Warning. pet could not be spawned.`);
  }

  handle_feed_pet() {
    if (this.pet) {
      this.m.send('C_USE_ITEM', 3, {
        gameId: this.g.me.gameId,
        id: 206049, // puppy figurine
        amount: 1,
        unk4: true
      });
      this.send(`Fed companion pet food.`);
    }
  }

  // helper
  try_spawn_pet() {
    // v93+ issue
    return false;
    //let pet = this.s.pet[this.g.me.name];
    //return this.m.trySend('C_REQUEST_SPAWN_SERVANT', 93, { id: pet.id, dbid: BigInt(pet.dbid) });
  }

  try_despawn_pet() {
    return false;
    //return this.m.trySend('C_REQUEST_DESPAWN_SERVANT', 93, {});
  }

  // code
  hook() {
    this.hooks.push(this.m.hook(...arguments));
  }

  load() {
    this.hook('S_REQUEST_SPAWN_SERVANT', 4, { order: 10 }, (e) => {
      if (e.ownerId === this.g.me.gameId) {
        this.pet = e.gameId;
        this.s.pet[this.g.me.name] = { id: e.id, dbid: e.dbid.toString() };
        this.handle_interval();
      }
    });

    this.hook('S_REQUEST_DESPAWN_SERVANT', 1, { order: 10 }, (e) => {
      this.pet === e.gameId ? this.pet = undefined : null;
    });
  }

  unload() {
    this.m.clearInterval(this.food_interval);

    if (this.hooks.length) {
      for (let h of this.hooks)
        this.m.unhook(h);
      this.hooks = [];
    }

    this.feed_pet = false;
    this.food_interval = 0;
    this.hold_feeding = false;
  }

  send(msg) { this.c.message(': ' + msg); }

  // reload
  saveState() {
    return this.pet;
  }

  loadState(state) {
    this.pet = state;
  }

}

module.exports = auto_pet;