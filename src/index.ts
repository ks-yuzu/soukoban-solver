// 左上 (0, 0)
class Position {
  constructor (public x: number, public y: number) {}

  public equals(p: Position) {
    return this.x === p.x && this.y === p.y
  }
}
type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'

class FieldObject {
  public pos: Position

  constructor (x: number, y: number) {
    this.pos = new Position(x, y)
  }

  public clone() {
    const ctor = this.constructor as new(x: number, y: number) => this;
    return new ctor(this.pos.x, this.pos.y)
  }

  public getUp()    { return new Position(this.pos.x, this.pos.y - 1) }
  public getDown()  { return new Position(this.pos.x, this.pos.y + 1) }
  public getLeft()  { return new Position(this.pos.x - 1, this.pos.y) }
  public getRight() { return new Position(this.pos.x + 1, this.pos.y) }
}
class Wall   extends FieldObject {}
class Block  extends FieldObject {
  public canMoveTo(direction: Direction, state: State) {
    switch (direction) {
      case 'UP':
      case 'DOWN': {
        const up   = this.getUp()
        if ( state.hasWallAt(up) || state.hasBlockAt(up)) { return false }

        const down = this.getDown()
        if ( state.hasWallAt(down) || state.hasBlockAt(down)) { return false }

        return true
      }
      case 'LEFT':
      case 'RIGHT': {
        const left = this.getLeft()
        if ( state.hasWallAt(left) || state.hasBlockAt(left)) { return false }

        const right = this.getRight()
        if ( state.hasWallAt(right) || state.hasBlockAt(right)) { return false }

        return true
      }
    }
  }

  public isStucked(state: State) {
    const up    = this.getUp()
    const down  = this.getDown()
    const left  = this.getLeft()
    const right = this.getRight()

    // そこが目的地なら OK
    if ( state.hasGoalAt(this.pos) ) { return false }

    // 2 方向壁だと動かせない
    if ( (state.hasWallAt(up)   || state.hasWallAt(down)) &&
         (state.hasWallAt(left) || state.hasWallAt(right)) ) { return true }

    // TODO: ブロック 4 つ組も true
    // TODO: 複数の荷物で狭い分離エリアを作ってしまっているケース (判定要検討) も true

    return false
  }
}
class Goal   extends FieldObject {}
class Player extends FieldObject {}

class State {
  // total steps
  private _totalCost: number
  get     totalCost() { return this._totalCost }
  public  addCost(cost: number) { return this._totalCost += cost }

  private _nRows:     number  // the number of rows
  private _nColumns:  number  // the number of columns

  private _player:     Player
  private _walls:      Wall[]
  private _goals:      Goal[]
  private _blocks:     Block[]
  public  hasWallAt (pos: Position) { return this._walls .some(i => i.pos.equals(pos)) }
  public  hasBlockAt(pos: Position) { return this._blocks.some(i => i.pos.equals(pos)) }
  public  hasGoalAt (pos: Position) { return this._goals .some(i => i.pos.equals(pos)) }

  private _isClonedBy?: State
  get     isClonedBy() { return this._isClonedBy }


  constructor(input: string)
  constructor(state: State)
  constructor(arg?: any) {
    if (arg instanceof State) {
      this._totalCost = arg._totalCost
      this._nRows     = arg._nRows
      this._nColumns  = arg._nColumns
      this._player    = arg._player.clone()
      this._walls     = arg._walls.map(i => new Wall(i.pos.x, i.pos.y))
      this._goals     = arg._goals.map(i => new Goal(i.pos.x, i.pos.y))
      this._blocks    = arg._blocks.map(i => new Block(i.pos.x, i.pos.y))
    }
    else if (typeof arg === 'string') {
      this._totalCost = 0
      this._nRows     = 0                  // dummy
      this._nColumns  = 0                  // dummy
      this._player    = new Player(-1, -1) // dummy
      this._walls     = []
      this._goals     = []
      this._blocks    = []

      this.load(arg)
    }
    else {
      throw new Error('internal error')
    }
  }

  // operation
  public getNextStates(): State[] {
    const nextStates = this._blocks.flatMap(targetBlock => {
      const newStates: State[] = []
      for (const direction of ['UP', 'DOWN', 'LEFT', 'RIGHT'] as Direction[]) {
        const newState = this.moveBlock(targetBlock, direction)
        if (newState != null) {
          newStates.push(newState)
        }
      }
      return newStates
    })
    return nextStates
  }

  public moveBlock(block: Block, direction: Direction): State | null {
    const clone = this.clone()

    // clone 側で同じ荷物を探す
    const targetBlock = clone._blocks.find(i => i.pos.equals(block.pos))
    if ( targetBlock == null ) {
      console.log(`Failed to move block. No block is found at (${block.pos.x}, ${block.pos.y})`)
      return null
    }

    // direction 方向に押す場合のプレイヤー位置
    const playerNewPos = direction === 'UP'    ? targetBlock.getDown()
                       : direction === 'DOWN'  ? targetBlock.getUp()
                       : direction === 'LEFT'  ? targetBlock.getRight()
                       : direction === 'RIGHT' ? targetBlock.getLeft()
                       :                         new Position(-1, -1)

    // 移動先 (playerNewPos) までの距離
    const distance = clone.getDistanceBetween(clone._player.pos, playerNewPos)
    if ( !isFinite(distance) ) { return null }

    // 物理的に押すことができるかチェック
    if ( !targetBlock.canMoveTo(direction, clone) ) { return null }

    // 移動
    clone._player.pos = new Position(targetBlock.pos.x, targetBlock.pos.y)
    switch (direction) {
      case 'UP':    targetBlock.pos.y--; break
      case 'DOWN':  targetBlock.pos.y++; break
      case 'LEFT':  targetBlock.pos.x--; break
      case 'RIGHT': targetBlock.pos.x++; break
    }
    clone.addCost(distance + 1) // 荷物を押す分で +1

    // 押したら詰むかチェック
    if ( targetBlock.isStucked(clone) ) { return null }

    return clone
  }

  // utility
  public getDistanceBetween(p1: Position, p2: Position) {
    const costMap: (number|string)[][] = []
    for (let i = 0; i < this._nRows; i++) { costMap.push([]) }

    for (let cost = 0, frontier = [p1]; cost < 1000; cost++) {
      if (frontier.length === 0) { break }

      const nextFrontier = []
      for (const pos of frontier) {
        if ( pos.equals(p2) ) { return cost }

        // 障害物があれば進行不可
        if (this.hasBlockAt(pos) || this.hasWallAt(pos)) {
          costMap[pos.y][pos.x] = Infinity
        }
        else {
          costMap[pos.y][pos.x] = cost

          // frontier のまわりでコストが付いていない場所を新たな frontier にする
          nextFrontier.push(...[
            new Position(pos.x, pos.y - 1),
            new Position(pos.x, pos.y + 1),
            new Position(pos.x - 1, pos.y),
            new Position(pos.x + 1, pos.y),
          ].filter(i => costMap[i.y][i.x] == null))
        }
      }
      // console.log(costMap)
      frontier = nextFrontier
    }

    return Infinity
  }

  public isCleared() {
    return this._goals.every(goal => this.hasBlockAt(goal.pos))
  }

  // public isGameover() {
  //   return this.blocks.some(i => i.isStucked(this))
  // }

  public equals(state: State) {
    // ブロック数は変わらないので, 数が異なる場合は考慮しない
    if ( this._blocks.every(i => state.hasBlockAt(i.pos)) === false ) {
      return false
    }

    // 移動可能エリアが分割されている時, プレイヤーのいるエリア区別する必要がある
    // ブロック配置が同じであることは保証されているので, 一方のフィールド情報で移動できるかチェックする
    // (距離無限なら移動できない → 異なるエリアにいる → 別の状態扱いにする)
    if ( !isFinite(this.getDistanceBetween(this._player.pos, state._player.pos)) ) {
      return false
    }

    return true
  }

  public clone() {
    const clone = new State(this)
    clone._isClonedBy = this
    return clone
  }

  public print() {
    for (let y = 0; y < this._nRows; y++) {
      for (let x = 0; x < this._nColumns; x++) {
        const pos = new Position(x, y)
        let char = ' '
        if      (this.hasWallAt(pos))                         { char = 'x' }
        else if (this.hasBlockAt(pos) && this.hasGoalAt(pos)) { char = '*' }
        else if (this.hasBlockAt(pos))                        { char = '+' }
        else if (this.hasGoalAt(pos))                         { char = '-' }
        else if (this._player.pos.equals(pos))                 { char = '@' }

        process.stdout.write(char)
      }
      process.stdout.write('\n')
    }
    process.stdout.write('\n')
  }

  public load(input: string) {
    const CELL_WALL   = 1
    const CELL_BLOCK  = 2
    const CELL_GOAL   = 4
    const CELL_PLAYER = 8

    this._nRows    = input.split('\n').length
    this._nColumns = input.split('\n').shift()?.length ?? 0

    input.split('\n').map((row, rowIdx) => {
      row.split('').map((cell, columnIdx) => {
        const value = parseInt(cell)

        if (value & CELL_WALL  ) { this._walls.push(new Wall(columnIdx, rowIdx)) }
        if (value & CELL_BLOCK ) { this._blocks.push(new Block(columnIdx, rowIdx)) }
        if (value & CELL_GOAL  ) { this._goals.push(new Goal(columnIdx, rowIdx)) }
        if (value & CELL_PLAYER) { this._player = new Player(columnIdx, rowIdx) }
      })
    })
  }
}

class Solver {
  private _stateQueue:      State[]
  private _processedStates: State[] = []

  private _lastState?: State

  get history(): State[] {
    const history = []

    for (let state = this._lastState; state != null; state = state.isClonedBy) {
      history.unshift(state)
    }

    return history
  }
  get totalCost() {
    return this._lastState?.totalCost
  }


  constructor(initState: State) {
    this._stateQueue = [initState]
  }

  public run() {
    while ( this._stateQueue.length > 0 ) {
      const state = this._stateQueue.shift()!
      // state.print()
      this._processedStates.push(state)

      if ( state.isCleared() ) {
        console.log('solved')
        this._lastState = state

        return state
      }

      // TODO: equals でプレイヤーがいるエリア単位で同一パターン判定しているので,
      //       歩数最短パターンを捨ててしまう可能性がある
      //       エリア単位ではなく, シンプルに pos.equals にする？
      const nextStates = state
        .getNextStates()
        .filter(i => !this._stateQueue.some(j => i.equals(j)) && !this._processedStates.some(j => i.equals(j)))
      // nextStates.forEach(i => i.print())

      this._appendStates(nextStates)
    }

    console.log('failed to solve')
  }

  private _appendStates(states: State[]) {
    // priority queue として使う (木にする程でもないので splice するだけ)
    for (const state of states) {
      const insertIndex = this._stateQueue.findIndex(i => i.totalCost > state.totalCost)
      this._stateQueue.splice(insertIndex, 0, state)
    }
  }
}


// const input = `
// 1111111
// 1801001
// 1021001
// 1000041
// 1111111`.trim()

// const input = `
// 11111111
// 10001001
// 10001001
// 10028041
// 11111111`.trim()

// const input = `
// 1111100
// 1000110
// 1002011
// 1142841
// 0111111`.trim()

const input = `
1111111
1000111
1002011
1028201
1002201
1444441
1111111`.trim()

const state = new State(input)
const solver = new Solver(state)

if ( solver.run() ) {
  solver.history.forEach(i => i.print())
  console.log(solver.totalCost)
}
