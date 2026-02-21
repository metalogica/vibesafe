# General Business Logic Programming Style

### Scope

Applies to:

- Domain services (orchestration, aggregation, coordination)
- Use cases (user-facing operations)
- Repository interactions
- Event handling and dispatching
- Portfolio, account, market, and trade workflows
- Any domain logic that is **not** encoding formal mathematics

### Philosophy

This is **intention-revealing, narrative code**. It follows Bob Martin's Clean Code principles: small functions, meaningful names, explicit control flow, minimal cognitive load. Code should read like a well-written explanation of business logic.

### Mandatory Characteristics

#### 1. Clear, Top-to-Bottom Narrative Flow

Functions tell a story. The reader should understand intent without jumping between definitions.

```typescript
// Good
async function settleMarket(marketId: string): Promise<void> {
  const market = await marketRepository.findById(marketId)

  if (!market.canSettle()) {
    throw new MarketNotReadyError(marketId)
  }

  const outcome = await outcomeResolver.resolve(market)
  const positions = await positionRepository.findByMarket(marketId)

  await payoutCalculator.distributeWinnings(positions, outcome)
  await market.markAsSettled(outcome)
}

// Bad: requires mental stack management
async function settleMarket(marketId: string): Promise<void> {
  const [market, positions] = await Promise.all([
    marketRepository.findById(marketId),
    positionRepository.findByMarket(marketId)
  ])

  if (!market.canSettle()) throw new MarketNotReadyError(marketId)

  await payoutCalculator.distributeWinnings(
    positions,
    await outcomeResolver.resolve(market)
  )

  await market.markAsSettled(await outcomeResolver.resolve(market))
}
```

#### 2. Small Functions with Single Responsibility

Each function does **one thing** at **one level of abstraction**. If you can extract a meaningful verb phrase, do so.

```typescript
// Good
async function executeTradeAndUpdatePortfolio(
  userId: string,
  trade: Trade
): Promise<void> {
  await validateTrade(trade)
  const cost = await calculateTradeCost(trade)
  await deductCost(userId, cost)
  await recordTrade(userId, trade)
  await updatePortfolioPositions(userId, trade)
}

async function validateTrade(trade: Trade): Promise<void> {
  if (trade.quantity.lte(0)) {
    throw new InvalidTradeQuantityError(trade.quantity)
  }
}

// Bad: single function doing five things
async function executeTradeAndUpdatePortfolio(
  userId: string,
  trade: Trade
): Promise<void> {
  if (trade.quantity.lte(0)) {
    throw new InvalidTradeQuantityError(trade.quantity)
  }

  const cost = await costService.calculate(trade)
  const account = await accountRepo.find(userId)
  account.balance = account.balance.sub(cost)
  await accountRepo.save(account)

  await tradeRepo.insert({ userId, ...trade })

  const portfolio = await portfolioRepo.find(userId)
  portfolio.positions[trade.outcomeId] =
    portfolio.positions[trade.outcomeId].add(trade.quantity)
  await portfolioRepo.save(portfolio)
}
```

#### 3. Intention-Revealing Names

Names answer: what is this, why does it exist, how is it used?

```typescript
// Good
const insufficientLiquidity = availableLiquidity.lt(requiredLiquidity)

// Bad
const check = availableLiquidity.lt(requiredLiquidity)
```

```typescript
// Good
function aggregatePositionsByOutcome(
  positions: Position[]
): Map<OutcomeId, Decimal> {
  // ...
}

// Bad
function process(data: Position[]): Map<string, Decimal> {
  // ...
}
```

#### 4. Keyword Arguments (Object Parameters)

All functions must use object parameters with immediate destructuring. This improves readability, makes parameter order irrelevant, and facilitates refactoring.

**Pattern**: Always name the parameter `input` and destructure immediately below.

```typescript
// Good
export function computeInitialState(input: {
  outcomeCount: number;
  alpha: number;
  liquidity: number;
}): AmmState {
  const { outcomeCount, alpha, liquidity } = input;
  // ... implementation
}

// Bad: positional parameters
export function computeInitialState(
  outcomeCount: number,
  alpha: number,
  liquidity: number,
): AmmState {
  // ... implementation
}
```

**Benefits**:
- Self-documenting call sites: `computeInitialState({ outcomeCount: 3, alpha: 0.5, liquidity: 1000 })`
- Refactoring-friendly: adding parameters doesn't break call sites
- No parameter order confusion
- Type safety at call site

**Single-parameter exception**: If a function truly takes one conceptual input, positional is acceptable:

```typescript
// Acceptable
function validateMarketId(marketId: string): void {
  // ...
}
```

#### 5. Explicit Control Flow

Avoid dense chaining or nested ternaries. Make branching and sequencing obvious.

```typescript
// Good
if (market.isClosed()) {
  return getHistoricalPrices(market.id)
}

return getCurrentPrices(market.id)

// Bad
return market.isClosed()
  ? getHistoricalPrices(market.id)
  : getCurrentPrices(market.id)
```

```typescript
// Good
const eligibleUsers = users.filter(isEligibleForPayout)
const payouts = eligibleUsers.map(calculatePayout)

for (const payout of payouts) {
  await distributePayout(payout)
}

// Bad
await Promise.all(
  users
    .filter(isEligibleForPayout)
    .map(calculatePayout)
    .map(distributePayout)
)
```

#### 6. Temporary Variables Improve Readability

Introducing intermediate variables is **encouraged** when they:

- Name a concept
- Reduce cognitive load
- Make conditionals easier to parse
- Break up long expressions

```typescript
// Good
const hasActivePositions = portfolio.positions.length > 0
const hasInsufficientCollateral = portfolio.collateral.lt(minimumCollateral)

if (hasActivePositions && hasInsufficientCollateral) {
  await liquidatePortfolio(portfolio)
}

// Bad
if (
  portfolio.positions.length > 0 &&
  portfolio.collateral.lt(minimumCollateral)
) {
  await liquidatePortfolio(portfolio)
}
```

#### 7. Side Effects Are Obvious

Functions that perform I/O, mutation, or side effects must signal this in their name (`execute`, `save`, `update`, `dispatch`) and return type (`Promise<void>`, `Promise<Result>`).

```typescript
// Good: clearly effectful
async function recordTradeInLedger(trade: Trade): Promise<void> {
  await ledgerRepository.insert(trade)
}

// Bad: looks pure but isn't
function addToLedger(trade: Trade): void {
  ledgerRepository.insert(trade) // hidden side effect
}
```

#### 8. Comments Explain Intent and Trade-Offs

Comments clarify **why** a decision was made, not what the code does.

```typescript
// Good
// We batch updates to avoid N+1 database queries
const updatedPositions = await positionRepository.updateMany(changes)

// Bad
// Update the positions
const updatedPositions = await positionRepository.updateMany(changes)
```

### Anti-Patterns

| Anti-Pattern | Why It Fails |
|--------------|--------------|
| Long functions (>20 lines) | Violates SRP; hard to test and understand |
| Nested conditionals (>2 levels) | Cognitive overload; extract guards or strategies |
| Abbreviations (`usr`, `pos`, `calc`) | Obscures intent; type less, read more |
| Implicit dependencies | Hard to test; inject everything |
| Chained `.map().filter().reduce()` over loops | Harder to debug and reason about sequencing |

### Canonical Example

See: Portfolio AMM service (reference implementation provided separately)
