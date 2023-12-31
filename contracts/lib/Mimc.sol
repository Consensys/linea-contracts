// SPDX-License-Identifier: Apache-2.0

// Copyright 2023 Consensys Software Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Code generated by gnark DO NOT EDIT
pragma solidity 0.8.19;

library Mimc {
  uint256 constant FR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617;

  function hash(bytes calldata _msg) external pure returns (bytes32 mimcHash) {
    assembly {
      let chunks := div(add(_msg.length, 0x1f), 0x20)

      for {
        let i := 0
      } lt(i, sub(chunks, 1)) {
        i := add(i, 1)
      } {
        let offset := add(_msg.offset, mul(i, 0x20))
        let chunk := calldataload(offset)

        let r := encrypt(mimcHash, chunk)
        mimcHash := addmod(addmod(mimcHash, addmod(r, mimcHash, FR_FIELD), FR_FIELD), chunk, FR_FIELD)
      }

      let offset := add(_msg.offset, mul(sub(chunks, 1), 0x20))
      let lastChunk := calldataload(offset)

      if iszero(eq(mod(_msg.length, 0x20), 0)) {
        let remaining := mod(_msg.length, 0x20)
        lastChunk := shr(mul(sub(0x20, remaining), 0x8), lastChunk)
      }

      let r := encrypt(mimcHash, lastChunk)
      mimcHash := addmod(addmod(mimcHash, addmod(r, mimcHash, FR_FIELD), FR_FIELD), lastChunk, FR_FIELD)

      function encrypt(h, chunk) -> output {
        let frField := FR_FIELD
        let tmpSum := 0

        tmpSum := addmod(
          addmod(chunk, h, frField),
          227063593160049201514509818732644766896230235191445544141110657236065169432,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          14216930871394413475885543358391969001796912808625170576412941718425727480905,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          13091462576550089354261023627641753004926491134347784566278243144585841078417,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          18736023174290548165050765799231505541711012637972192037099796877637059010016,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          796636033841689627732941016044857384234234277501564259311815186813195010627,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          7049792165217502363114227773374115492495393176744730189515562778035071867821,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          17004095116726405864684454804540866859059278240914071423178037737714962317801,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          14110268636549425055632566045581853560423521131037962488540655987535191004969,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          18183635788335456259215276538456634373878691301055828686319747253615002143747,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          17094270359512653934788537386985943119745071422450083986863088746253169651698,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          21606397331421151312290269496743528579353487580150269962583704985025203683566,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          11482796835106945909650417409009375869128464918808201005317159508926845333372,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          5896114894234359837481980051604224653571872854250471410846947653395077045175,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          8043758726292679243102809161324039047742869268808278302475346342056293903111,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          9765227797118338345724719313674898871992672983681676861011354974715998221736,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          9980184672909482180637695009382192818723793158333771031442726952979088300949,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          8231877132811199596376758288825197494440517476607659739835166243301765860904,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          8335067676479817842493472758560802142744298375820509901958843910507461215099,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          10841545820231554131682518174137979197520487236302295350589030622478073612580,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          3219131731887960949807515150723614694444414566887389129377006765182004280513,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          56804755552986645089184612629551548380712103263713508879501466305875964502,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          3063594241115875600174308534745809602942823704041628148569154884406804087107,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          1022229143886614551843240999132524298883977051285206014564945818204512723699,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          1247948173836835613759834564361354902760693928209107555848903547602125609667,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          12690047342343207986715505449836807591806230840704578918412884362668236488424,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          9456585747207468967136341612034989517427340607940281880317747335469436896657,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          10555679902623742965715379393380415053883065457992409910544092743581080934995,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          7642145723831431937150654031296178463709608595366450210492201904757626429246,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          12796285368351778411157416332578703705714646412236885840835353324717839499288,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          9920917725324856014628946457815467011979864273734012436016568174149575073620,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          1806771888767844400796964154165462987833794566790129616905621802681918305653,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          2237188035570518200375801347148339263941951653352635838130411033524031543911,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          6159774869789305950383877854134202099758528146886459191738581516739660641536,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          2159153222189174173490067225063044363535871059524538695070191871847470955412,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          3796681237523026223086145426486778389352604372052172299127843115700063953978,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          15056204194454071177732947070380798505823141690312550077512103668193190650776,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          18847697144542616776597460523489465741015527416695791143858315271487053716345,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          6010749183509972177829296064870149897270623093292652040160770247410917400713,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          18573886017870388584791853665036341308998474745558018999552747786306327187163,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          1902990407634160450975366476679732066298558065179856843056247078583090353402,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          5056480146405086811789505170440731715530475328844870175949109998024731067467,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          15740426253908866033612398810786354575055336092664709132388682334602601168702,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          491250169370634115048394492066021687801835886554368663023106896215909698645,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          5255739895973293668031562539559209975940249484631633008164126407281628232615,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          2993874367492450065981125977298561936411381709727853908030896236122420343727,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          1403914884782249096009089982237816316006749353131179527973160317711491651076,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          12914056360493359423764695636160432190520475662743083737270395470517659710829,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          2917404364788167044194419588360849732661365640462661072201491302974369825438,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          20784103425950430825528915699354924111453274156179753313577396452562475630409,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          1316449090346410801845183915381769525990226349513436734911941391785200212382,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          19891032074353122751368091896719823139652894181016649395806048173493086857338,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          5815046378509054585353936553633012260823210849110325320012946858007466529124,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          9342667946085721753232292005472701104293420214150876291070202875265183228493,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          3220266212393036831161802760991433604684006326671889836355824255100900631167,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          5129486740981610555565012597292200072154542792843090445908325336406070684212,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          10365499242482502687915472615946022335465942941657641380012062207514707672369,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          4611075984531475563366272046528439696064144614475739366357201914182455577262,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          12274444357037046733725220420843071726458636107722716111189924462679653993388,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          2444021750719441015829197081940411467903641739650651394173044346750720208186,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          15143675381185307178500906868356334825651015737618718091251777377451213407009,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          12298344485990016534010212669317442637641970988734864662627733004522811247925,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          407792086961455574135957029358146763364316705425829200860200716711144772110,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          14686495456688325356229693863075020970632170023662416843806799342111029622608,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          18951855733129374999539824238637835284715674696067944400774670287760774220945,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          16334111234389595299193801902740634241244222168925513590632042896157659801559,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          19623255796206582213343044956093476486139104852525580813879681620362890897558,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          19284965820494284222482683988641716023855422844851137438394494268143521834633,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          5042179171081431331282902567660865915154957134450098475064856996863766266700,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          19075637350940522721481728672122652040982051980503549922053017343878171287859,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          3096096603894689121667217859533027222641140852874591863405531829483163197840,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          21543191916254714877479305695881635899536323218308582727971577317237448630394,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          9980826669647369562409093155367822719846527509077693563581519695180055111612,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          15696810051723434179520892802382061883123916463500679794859575791011338569408,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          16710441142546269914456840870536846684666759198340322352862050391462853257859,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          16784162115836373795735205525741716397089015491804805056190418507628689514930,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          20919057090859990208154240431041177593233739098537292808899071595933232729923,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          10599687814613664602758829894851759731719366381965307423459731431292674962169,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          18092495413286015678790630168208787644418599959399842781132549515553139410584,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          3711799916574241475420555831932793749725513171598155737019147179555971323932,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          3878599345777774665565912098811702945088203032347412020650440180042070635932,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          5221687210067764220342563941232799146265831780579450576980295260767640382879,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          8572221995878907446339305767802962859956678949340179087676700081887070991418,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          13250870432967790116799427082816480335296645135069568814513747123924233796635,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          1762401353042500109291165674468304204146747021756564981770933537807125319114,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          16297297017503580916701479288278297532093130260977290972316747472919454831982,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          11301542023144145761538286188600886091507808962937720724476656305360091843144,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          3226463335346792970204307734198400221579260082314988957001789813920653640539,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          18201479370055215790852976435001157175848060363403485699590922691559044268816,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          1421776804632889503250299670147988126727383540687678953592715279854500795359,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          21230806036983379610681285136437154793727917065272091459526637553303154098111,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          4890882571712671501605561097268997756779482040164834629188098947876004725416,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          5593942559448006934122110327465529553527338130800655100545929619006646130703,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          19858351320072490775901034833039724699209320536870921374639489244857675659132,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          20569043303914081560731019065398457647606565616902130240528129599578592228968,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          10079763651682455157739628234628529503046958675131789218119668348482240995889,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          12075806963751214072241023676113780594016698427239126221026218940878020594099,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          16943711675576883986628449992969978423674439022821403957709854115749711096791,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          1649367951959654604433060041378790418650827672660780721804854858634469108499,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          11957779911765486656644689149330846943313705416524223567398485006010159944456,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          1467372234246581691639910443837800274464279239719080130524501855420568931562,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          16345733847331835103389317805143010119891715846287496394786195665951149072330,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          7448836565550394578623806516077867680872791214995424737491744252881969933895,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          8650625054615070484889009442902102532553165757475036656003778307974620126687,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          11907653828035696663714143522983869211190719525809271814618637057421334515531,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          2886235945117591824771809965323805334808414280306969797067740169710933875743,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          10917882835509774955453905588848475782845168316402655627358883243042341451042,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          19971838851328344406118398405782812664383760583892867152477371808954818808044,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          18265625854115489546229892300234363068277159796553916584413873595353870332297,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          11541833244575501930159939361686046962070402099593978040285396521535417462043,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)

        tmpSum := addmod(
          addmod(output, h, frField),
          14681674628590376571212438852682626513594958603045820146231225156751765152354,
          frField
        )
        output := mulmod(tmpSum, tmpSum, frField)
        output := mulmod(mulmod(output, output, frField), tmpSum, frField)
      }
    }
  }
}
