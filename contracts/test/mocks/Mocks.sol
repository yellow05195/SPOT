// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AggregatorV3Interface} from "../../src/interfaces/AggregatorV3Interface.sol";

/// @dev ERC-20 générique à décimales paramétrables (USDG = 6, CBBTC = 8, Stock Token = 18).
contract MockERC20 is ERC20 {
    uint8 private immutable _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Stock Token : 18 décimales + `currentMultiplier()` en point fixe 18.
contract MockStockToken is MockERC20 {
    uint256 public currentMultiplier = 1e18;

    constructor(string memory name_, string memory symbol_) MockERC20(name_, symbol_, 18) {}

    function setMultiplier(uint256 m) external {
        currentMultiplier = m;
    }
}

/// @dev Feed Chainlink pilotable : prix, fraîcheur, rounds.
contract MockFeed is AggregatorV3Interface {
    uint8 public immutable decimals;
    int256 public answer;
    uint80 public roundId = 100;
    uint80 public answeredInRound = 100;
    uint256 public updatedAt;
    string public description = "MOCK / USD";

    constructor(uint8 decimals_, int256 answer_) {
        decimals = decimals_;
        answer = answer_;
        updatedAt = block.timestamp;
    }

    function set(int256 answer_) external {
        answer = answer_;
        updatedAt = block.timestamp;
        roundId += 1;
        answeredInRound = roundId;
    }

    function setUpdatedAt(uint256 t) external {
        updatedAt = t;
    }

    function setRounds(uint80 roundId_, uint80 answeredInRound_) external {
        roundId = roundId_;
        answeredInRound = answeredInRound_;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (roundId, answer, updatedAt, updatedAt, answeredInRound);
    }
}

/// @dev Un contrat qui ne répond à rien : ni `decimals()`, ni `currentMultiplier()`.
contract MockDeadToken {}

/// @dev Receveur ERC-1155 qui tente une réentrance sur `claim` pendant le mint de la fiche.
interface IReenter {
    function reenter() external;
}

contract ReentrantReceiver {
    IReenter public target;
    bool public attempted;
    bool public succeeded;

    function arm(IReenter t) external {
        target = t;
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external returns (bytes4) {
        if (address(target) != address(0) && !attempted) {
            attempted = true;
            try target.reenter() {
                succeeded = true;
            } catch {}
        }
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return this.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4) external pure returns (bool) {
        return true;
    }
}
