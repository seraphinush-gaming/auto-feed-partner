class AutoPet {

  constructor(mod) {

    this.mod = mod;
    this.cmd = mod.command;
    this.settings = mod.settings;
    this.hooks = [];

    this.food_interval = 0;
    this.hold = false;
    this.feedPet = false;
    this.pet = undefined;
    this.user = {
      gameId: BigInt(0),
      name: ''
    };

    // command
    this.cmd.add('pet', {
      '$none': () => {
        this.settings.enable = !this.settings.enable;
        this.send(`${this.settings.enable ? 'en' : 'dis'}abled`);
      },
      'fishing': () => {
        this.settings.fishing = !this.settings.fishing;
        this.send(`Companion spawned whiled fishing ${this.settings.fishing ? 'en' : 'dis'}abled.`);
      },
      'set': (num) => {
        if (!isNaN(num)) {
          this.settings.interval = num;
          this.send(`Set pet feeding interval to ${num} minutes.`);
        } else {
          this.send(`Invalid argument. usage : pet set (num)`);
        }
      },
      '$default': () => {
        this.send(`Invalid argument. usage : pet [fishing|set]`);
      }
    });

    // game state
    this.mod.game.on('enter_game', () => {
      this.user.gameId = this.mod.game.me.gameId;
      this.user.name = this.mod.game.me.name;

      this.mod.hookOnce('S_SPAWN_ME', 'raw', { order: 10 }, () => {
        if (this.settings.enable && this.settings.pet[this.user.name]) {
          if (this.trySpawnPet()) {
            this.food_interval = this.mod.setInterval(() => {
              if (!this.hold) {
                this.tryFeedingPet(206049);
              } else {
                this.feedPet = true;
              }
            }, (this.settings.interval * 60 * 1000));
            this.send(`Spawning companion.`);
          } else {
            this.send(`Warning. pet could not be spawned.`);
          }
        }
      });
    });

    this.load();

  }

  destructor() {
    this.mod.clearInterval(this.food_interval);
    this.mod.saveSettings();
    this.cmd.remove('pet');
    this.unload();

    this.user = undefined;
    this.pet = undefined;
    this.food_interval = undefined;

    this.hooks = undefined;
    this.settings = undefined;
    this.cmd = undefined;
    this.mod = undefined;
  }

  trySpawnPet() {
    let pet = this.settings.pet[this.user.name];
    let res = this.mod.trySend('C_REQUEST_SPAWN_SERVANT', 1, {
      id: pet.id,
      dbid: BigInt(pet.dbid)
    });
    return res;
  }

  tryFeedingPet(id) {
    if (this.pet) {
      let res = this.mod.trySend('C_USE_ITEM', 3, {
        gameId: this.user.gameId,
        id: id,
        amount: 1,
        unk4: true
      });
      if (res) {
        this.send(`Fed companion pet food.`);
      } else {
        this.mod.clearInterval(this.food_interval);
        this.send(`Warning. pet food could not be fed.`);
      }
    }
  }

  // code
  hook() {
    this.hooks.push(this.mod.hook(...arguments));
  }

  tryHook() {
    let _ = this.mod.tryHook(...arguments);
    if (!_) {
      this.send(`Unmapped protocol packet found.`);
    }
  }

  load() {
    /* this.hook('S_LOGIN', this.mod.majorPatchVersion >= 81 ? 13 : 12, { order: -1000 }, (e) => {
      this.user.gameId = e.gameId;
      this.user.name = e.name;

      this.mod.hookOnce('S_SPAWN_ME', 'raw', () => {
        if (this.settings.enable && this.settings.pet[this.user.name]) {
          if (this.trySpawnPet()) {
            this.food_interval = this.mod.setInterval(() => {
              this.tryFeedingPet(206049);
            }, (this.settings.interval * 60 * 1000));
            this.send(`Spawning companion.`);
          } else {
            this.send(`Warning. pet could not be spawned.`);
          }
        }
      });
    }); */

    this.hook('S_REQUEST_SPAWN_SERVANT', 2, { order: 10 }, (e) => {
      if (e.ownerId === this.user.gameId) {
        this.pet = e.gameId;
        this.settings.pet[this.user.name] = { id: e.id, dbid: e.dbid.toString() };
      }
    });

    this.hook('S_REQUEST_DESPAWN_SERVANT', 1, { order: 10 }, (e) => {
      if (this.pet === e.gameId) {
        this.pet = undefined;
      }
    });

    // mount
    this.hook('S_MOUNT_VEHICLE', 'raw', () => {
      this.hold = true;
    });

    this.hook('S_UNMOUNT_VEHICLE', 'raw', () => {
      this.hold = false;
      if (this.feedPet) {
        this.tryFeedingPet(206049);
        this.feedPet = false;
      }
    });

    // fishing
    this.tryHook('C_CAST_FISHING_ROD', 'raw', { order: 10 }, () => {
      if (this.settings.enable && !this.settings.fishing && this.pet) {
        this.send('Fishing detected. despawning companion.');
        try {
          this.mod.send('C_REQUEST_DESPAWN_SERVANT', 1, {});
          this.mod.clearInterval(this.food_interval);
        } catch {
          this.send(`Warning. companion could not be despawned`);
          this.mod.warn('Unmapped protocol packet \<C_REQUEST_DESPAWN_SERVANT\>.');
        }
      }
    });
  }

  unload() {
    if (this.hooks.length) {
      for (let h of this.hooks)
        this.mod.unhook(h);
      this.hooks = [];
    }
  }

  send() { this.cmd.message(': ' + [...arguments].join('\n\t - ')); }

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

module.exports = AutoPet;