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
}
class Wall   extends FieldObject {}
class Block  extends FieldObject {
  public canMoveTo(direction: Direction, state: State) {
    // state.print()
    switch (direction) {
      case 'UP':
      case 'DOWN': {
        const up   = new Position(this.pos.x, this.pos.y - 1)
        if ( state.hasWallAt(up) || state.hasBlockAt(up)) { return false }

        const down = new Position(this.pos.x, this.pos.y + 1)
        if ( state.hasWallAt(down) || state.hasBlockAt(down)) { return false }

        const distance = state.getDistanceBetween(state.player.pos, (direction === 'UP' ? down : up))
        if ( !isFinite(distance) ) { return false }
        // TODO: 移動後の詰みチェック
        //       goalでない && 全方向に動けない
        return true
      }
      case 'LEFT':
      case 'RIGHT': {
        const left = new Position(this.pos.x - 1, this.pos.y)
        if ( state.hasWallAt(left) || state.hasBlockAt(left)) { return false }

        const right = new Position(this.pos.x + 1, this.pos.y)
        if ( state.hasWallAt(right) || state.hasBlockAt(right)) { return false }

        const distance = state.getDistanceBetween(state.player.pos, (direction === 'LEFT' ? right : left))
        if ( !isFinite(distance) ) { return false }
        // TODO: 移動後の詰みチェック
        return true
      }
    }
  }

  public isStucked(state: State) {
    const directions: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT']
    // return directions.every(i => !this.canMoveTo(direction))
    return false
  }
}
class Goal   extends FieldObject {}
class Player extends FieldObject {}

class State {
  private nRows:    number  // the number of rows
  private nColumns: number  // the number of columns

  public player:    Player
  public walls:     Wall[]
  public goals:     Goal[]
  public blocks:    Block[]

  public isClonedBy?: State

  constructor(input: string)
  constructor(state: State)
  constructor(arg?: any) {
    if (arg instanceof State) {
      this.nRows    = arg.nRows
      this.nColumns = arg.nColumns
      this.player   = arg.player.clone()
      this.walls    = arg.walls.map(i => new Wall(i.pos.x, i.pos.y))
      this.goals    = arg.goals.map(i => new Goal(i.pos.x, i.pos.y))
      this.blocks   = arg.blocks.map(i => new Block(i.pos.x, i.pos.y))
    }
    else if (typeof arg === 'string') {
      this.nRows    = 0                  // dummy
      this.nColumns = 0                  // dummy
      this.player   = new Player(-1, -1) // dummy
      this.walls    = []
      this.goals    = []
      this.blocks   = []

      this.load(arg)
    }
    else {
      throw new Error('internal error')
    }
  }

  // operation
  public getNextStates(): State[] {
    const nextStates = this.blocks.flatMap(targetBlock => {
      const newStates: State[] = []
      for (const direction of ['UP', 'DOWN', 'LEFT', 'RIGHT'] as Direction[]) {
        if (targetBlock.canMoveTo(direction, this)) {
          const clone = this.clone()
          clone.moveBlock(targetBlock, direction)
          newStates.push(clone)
        }
        // else {
        //   console.log(`cannot move to ${direction}`)
        // }
      }
      return newStates
    })
    return nextStates
  }

  public moveBlock(block: Block, direction: Direction) {
    const targetBlock = this.blocks.find(i => i.pos.equals(block.pos))
    if ( targetBlock == null ) {
      throw new Error(`Failed to move block. No block found at (${block.pos.x}, ${block.pos.y})`)
    }

    this.player.pos = new Position(targetBlock.pos.x, targetBlock.pos.y)
    switch (direction) {
      case 'UP':    targetBlock.pos.y--; break
      case 'DOWN':  targetBlock.pos.y++; break
      case 'LEFT':  targetBlock.pos.x--; break
      case 'RIGHT': targetBlock.pos.x++; break
    }
  }

  // utility
  public hasWallAt(pos: Position) {
    return this.walls.some(i => i.pos.equals(pos))
  }

  public hasBlockAt(pos: Position) {
    return this.blocks.some(i => i.pos.equals(pos))
  }

  public hasGoalAt(pos: Position) {
    return this.goals.some(i => i.pos.equals(pos))
  }

  public getDistanceBetween(p1: Position, p2: Position) {
    const costMap: (number|string)[][] = []
    for (let i = 0; i < this.nRows; i++) { costMap.push([]) }

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
    return this.goals.every(goal => this.hasBlockAt(goal.pos))
  }

  public isGameover() {
    return this.blocks.some(i => i.isStucked(this))
  }

  public equals(state: State) {
    // ブロック数は変わらないので, 数が異なる場合は考慮しない
    if ( this.blocks.every(i => state.hasBlockAt(i.pos)) === false ) {
      return false
    }

    // 移動可能エリアが分割されている時, プレイヤーのいるエリア区別する必要がある
    // ブロック配置が同じであることは保証されているので, 一方のフィールド情報で移動できるかチェックする
    // (距離無限なら移動できない → 異なるエリアにいる → 別の状態扱いにする)
    if ( !isFinite(this.getDistanceBetween(this.player.pos, state.player.pos)) ) {
      return false
    }

    return true
  }

  public clone() {
    const clone = new State(this)
    clone.isClonedBy = this
    return clone
  }

  public print() {
    for (let y = 0; y < this.nRows; y++) {
      for (let x = 0; x < this.nColumns; x++) {
        const pos = new Position(x, y)
        let char = ' '
        if      (this.hasWallAt(pos))                         { char = 'x' }
        else if (this.hasBlockAt(pos) && this.hasGoalAt(pos)) { char = '*' }
        else if (this.hasBlockAt(pos))                        { char = '+' }
        else if (this.hasGoalAt(pos))                         { char = '-' }
        else if (this.player.pos.equals(pos))                 { char = '@' }

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

    this.nRows    = input.split('\n').length
    this.nColumns = input.split('\n').shift()?.length ?? 0

    input.split('\n').map((row, rowIdx) => {
      row.split('').map((cell, columnIdx) => {
        const value = parseInt(cell)

        if (value & CELL_WALL  ) { this.walls.push(new Wall(columnIdx, rowIdx)) }
        if (value & CELL_BLOCK ) { this.blocks.push(new Block(columnIdx, rowIdx)) }
        if (value & CELL_GOAL  ) { this.goals.push(new Goal(columnIdx, rowIdx)) }
        if (value & CELL_PLAYER) { this.player = new Player(columnIdx, rowIdx) }
      })
    })
  }
}

class Solver {
  private stateQueue:      State[]
  private processedStates: State[] = []

  constructor(initState: State) {
    this.stateQueue = [initState]
  }

  public run() {
    while ( this.stateQueue.length > 0 ) {
      const state = this.stateQueue.shift()!
      // state.print()
      this.processedStates.push(state)

      if ( state.isCleared() ) {
        console.log('solved')
        return state
      }

      const nextStates = state
        .getNextStates()
        .filter(i => !this.stateQueue.some(j => i.equals(j)) && !this.processedStates.some(j => i.equals(j)))
      // nextStates.forEach(i => i.print())

      this._appendStates(nextStates)
    }

    console.log('failed to solve')
  }

  private _appendStates(states: State[]) {
    // TODO: insert using numStep
    this.stateQueue.push(...states)
  }
}


// const input = `
// 1111111
// 1801001
// 1021001
// 1000041
// 1111111`.trim()

const input = `
11111111
10001001
10001001
10028041
11111111`.trim()

const state = new State(input)
const solver = new Solver(state)
const lastState = solver.run()
if (lastState != null) { showHistory(lastState) }


function showHistory(lastState: State) {
  const history = []

  let state = lastState
  while ( true ) {
    history.unshift(state)

    if (state.isClonedBy == null) { break }
    state = state.isClonedBy
  }
  history.forEach(i => i.print())
}
