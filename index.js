'use strict';

const path = require('path');

const BAIT = [
  206000, 206001, 206002, 206003, 206004, // bait i-v
  206905, // dappled bait
  206053, // pilidium bait
  206901, // popo bait
  206900, // popori bait
  206904 // rainbow bait
];

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

    // set definition
    try {
      this.m.dispatch.addDefinition('C_REQUEST_SPAWN_SERVANT', 0, path.join(__dirname, 'def', 'C_REQUEST_SPAWN_SERVANT.0.def'), true);
      this.m.dispatch.addDefinition('C_REQUEST_DESPAWN_SERVANT', 0, path.join(__dirname, 'def', 'C_REQUEST_DESPAWN_SERVANT.0.def'), true);
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
      'fishing': () => {
        this.s.fishing = !this.s.fishing;
        this.send(`Companion spawned whiled fishing ${this.s.fishing ? 'en' : 'dis'}abled.`);
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
      '$default': () => { this.send(`Invalid argument. usage : pet [fishing|set]`); }
    });

    // game state
    this.g.on('enter_game', () => {
      if (this.s.enable) {
        this.m.hookOnce('S_SPAWN_ME', 'event', { order: 10 }, () => {
          this.s.pet[this.g.me.name] ? this.handle_spawn_pet() : null;
        });
      }
    });

    this.g.me.on('change_zone', () => {
      if (this.to_spawn_next_zone) {
        this.to_spawn_next_zone = false;
        this.handle_spawn_pet();
      }
    });

    this.g.me.on('mount', () => {
      this.hold_feeding = true;
    });

    this.g.me.on('dismount', () => {
      this.hold_feeding = false;
      if (this.feed_pet) {
        this.try_feed_pet();
        this.feed_pet = false;
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
      !this.hold_feeding ? this.try_feed_pet() : this.feed_pet = true;
    }, (this.s.interval * 60 * 1000));
  }

  handle_spawn_pet() {
    if (this.try_spawn_pet()) {
      this.m.clearInterval(this.food_interval);
      this.handle_interval();
      this.send(`Spawning companion.`);
    } else {
      this.send(`Warning. pet could not be spawned.`);
    }
  }

  // helper
  try_spawn_pet() {
    let pet = this.s.pet[this.g.me.name];
    let res = this.m.trySend('C_REQUEST_SPAWN_SERVANT', 0, {
      id: pet.id,
      dbid: BigInt(pet.dbid)
    });
    return res;
  }

  try_feed_pet() {
    if (this.pet) {
      this.m.send('C_USE_ITEM', 3, {
        gameId: this.g.me.gameId,
        id: 206049,
        amount: 1,
        unk4: true
      });
      this.send(`Fed companion pet food.`);
    }
  }

  // code
  hook() {
    this.hooks.push(this.m.hook(...arguments));
  }

  load() {
    // servant
    this.hook('S_REQUEST_SPAWN_SERVANT', 3, { order: 10 }, (e) => {
      if (e.ownerId === this.g.me.gameId) {
        this.pet = e.gameId;
        this.s.pet[this.g.me.name] = { id: e.id, dbid: e.dbid.toString() };
      }
    });

    this.hook('S_REQUEST_DESPAWN_SERVANT', 1, { order: 10 }, (e) => {
      this.pet === e.gameId ? this.pet = undefined : null;
    });

    // fishing
    this.hook('S_SYSTEM_MESSAGE', 1, { order: 10 }, (e) => {
      if (this.s.enable && !this.s.fishing && this.pet) {
        let msg = this.m.parseSystemMessage(e.message);

        switch (msg.id) {
          case 'SMT_ITEM_USED_ACTIVE':
            let item = parseInt(msg.tokens.ItemName.substr(6), 10);
            if (BAIT.includes(item)) {
              this.send(`Fishing detected. despawning companion.`);
              let despawn = this.m.trySend('C_REQUEST_DESPAWN_SERVANT', 0, {});

              if (despawn) {
                this.to_spawn_next_zone = true;
                this.m.clearInterval(this.food_interval);
              }
              else {
                this.send(`Warning. companion could not be despawned`);
              }
            }
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

  send() { this.c.message(': ' + [...arguments].join('\n - ')); }

  // reload
  saveState() {
    return this.pet;
  }

  loadState(state) {
    this.pet = state;
  }

}

module.exports = auto_pet;