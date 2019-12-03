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
    this.to_spawn_next_zone = false;
    this.pet = BigInt(0);
    this.user = {
      gameId: BigInt(0),
      name: ''
    };

    // set definition
    try {
      this.m.dispatch.addDefinition('C_REQUEST_SPAWN_SERVANT', 1, path.join(__dirname, 'def', 'C_REQUEST_SPAWN_SERVANT.1.def'), true);
      this.m.dispatch.addDefinition('C_REQUEST_DESPAWN_SERVANT', 1, path.join(__dirname, 'def', 'C_REQUEST_DESPAWN_SERVANT.1.def'), true);
    } catch {
      this.m.warn('Error. could not add required definition(s).');
    }

    // command
    this.c.add('pet', {
      '$none': () => {
        this.s.enable = !this.s.enable;
        this.send(`${this.s.enable ? 'en' : 'dis'}abled`);
      },
      'fishing': () => {
        this.s.fishing = !this.s.fishing;
        this.send(`Companion spawned whiled fishing ${this.s.fishing ? 'en' : 'dis'}abled.`);
      },
      'set': (n) => {
        n = parseInt(n);
        if (!isNaN(n)) {
          this.s.interval = n;
          this.send(`Set pet feeding interval to ${n} minutes.`);
        } else {
          this.send(`Invalid argument. usage : pet set &lt;num&gt;`);
        }
      },
      '$default': () => {
        this.send(`Invalid argument. usage : pet [fishing|set]`);
      }
    });

    // game state
    this.g.on('enter_game', () => {
      this.user.gameId = this.g.me.gameId;
      this.user.name = this.g.me.name;

      this.m.hookOnce('S_SPAWN_ME', 'event', { order: 10 }, () => {
        if (this.s.enable && this.s.pet[this.user.name]) {
          if (this.try_spawn_pet()) {
            this.food_interval = this.m.setInterval(() => {
              !this.hold_feeding ? this.try_feeding_pet() : this.feed_pet = true;
            }, (this.s.interval * 60 * 1000));
            this.send(`Spawning companion.`);
          } else {
            this.send(`Warning. pet could not be spawned.`);
          }
        }
      });
    });

    this.g.me.on('change_zone', () => {
      if (this.to_spawn_next_zone) {
        this.to_spawn_next_zone = false;
        this.try_spawn_pet();
      }
    });

    // mount
    this.g.me.on('mount', () => {
      this.hold_feeding = true;
    });

    this.g.me.on('dismount', () => {
      this.hold_feeding = false;
      if (this.feed_pet) {
        this.try_feeding_pet();
        this.feed_pet = false;
      }
    });

    this.load();

  }

  destructor() {
    this.m.clearInterval(this.food_interval);
    this.c.remove('pet');
    this.unload();
  }

  // helper
  try_spawn_pet() {
    let pet = this.s.pet[this.user.name];
    let res = this.m.trySend('C_REQUEST_SPAWN_SERVANT', 1, {
      id: pet.id,
      dbid: BigInt(pet.dbid)
    });
    return res;
  }

  try_feeding_pet() {
    if (this.pet) {
      let res = this.m.trySend('C_USE_ITEM', 3, {
        gameId: this.user.gameId,
        id: 206049,
        amount: 1,
        unk4: true
      });
      if (res) {
        this.send(`Fed companion pet food.`);
      } else {
        this.m.clearInterval(this.food_interval);
        this.send(`Warning. pet food could not be fed.`);
      }
    }
  }

  // code
  hook() {
    this.hooks.push(this.m.hook(...arguments));
  }

  tryHook() {
    let res = this.m.tryHook(...arguments);
    !res ? this.send(`Unmapped protocol packet found.`) : null;
  }

  load() {
    // servant
    this.hook('S_REQUEST_SPAWN_SERVANT', 3, { order: 10 }, (e) => {
      if (e.ownerId === this.user.gameId) {
        this.pet = e.gameId;
        this.s.pet[this.user.name] = { id: e.id, dbid: e.dbid.toString() };
      }
    });

    this.hook('S_REQUEST_DESPAWN_SERVANT', 1, { order: 10 }, (e) => {
      this.pet === e.gameId ? this.pet = undefined : null;
    });

    // fishing
    this.tryHook('C_CAST_FISHING_ROD', 'event', { order: 10 }, () => {
      if (this.s.enable && !this.s.fishing && this.pet) {
        this.send('Fishing detected. despawning companion.');
        try {
          this.m.send('C_REQUEST_DESPAWN_SERVANT', 1, {});
          this.to_spawn_next_zone = true;
          this.m.clearInterval(this.food_interval);
        } catch {
          this.send(`Warning. companion could not be despawned`);
          this.m.warn('Unmapped protocol packet \<C_REQUEST_DESPAWN_SERVANT\>.');
        }
      }
    });
  }

  unload() {
    if (this.hooks.length) {
      for (let h of this.hooks)
        this.m.unhook(h);
      this.hooks = [];
    }
  }

  send() { this.c.message(': ' + [...arguments].join('\n\t - ')); }

  // reload
  saveState() {
    let state = {
      pet: this.pet,
      user: this.user
    };
    return state;
  }

  loadState(state) {
    this.pet = state.pet;
    this.user = state.user;
  }

}

module.exports = auto_pet;