# Financial partners & employees update

- Added employees as first-class records under Finance > Partners & Employees.
- Added partner/employee cash or bank money movements.
- New movements update treasury balances immediately and persist to Firestore.
- Movements are not treated as revenue or expenses.
- Daily Journal recognizes partner/employee movements with dedicated labels.
- Party movement balances are derived from treasury transactions, so they cannot drift from the recorded movements.
- Outgoing movements are blocked when the selected cash/bank balance is insufficient.
- Existing partner capital amount remains separate from movement history and profit-distribution capital.
