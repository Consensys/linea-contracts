// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.0;

import { PlonkVerifier } from "../PlonkVerifier.sol";

contract TestPlonkVerifier is PlonkVerifier {
  event PrintBool(bool a);

  struct Proof {
    uint256 proof_l_com_x;
    uint256 proof_l_com_y;
    uint256 proof_r_com_x;
    uint256 proof_r_com_y;
    uint256 proof_o_com_x;
    uint256 proof_o_com_y;
    // h = h_0 + x^{n+2}h_1 + x^{2(n+2)}h_2
    uint256 proof_h_0_x;
    uint256 proof_h_0_y;
    uint256 proof_h_1_x;
    uint256 proof_h_1_y;
    uint256 proof_h_2_x;
    uint256 proof_h_2_y;
    // wire values at zeta
    uint256 proof_l_at_zeta;
    uint256 proof_r_at_zeta;
    uint256 proof_o_at_zeta;
    //uint256[STATE_WIDTH-1] permutation_polynomials_at_zeta; // Sσ1(zeta),Sσ2(zeta)
    uint256 proof_s1_at_zeta; // Sσ1(zeta)
    uint256 proof_s2_at_zeta; // Sσ2(zeta)
    //Bn254.G1Point grand_product_commitment;                 // [z(x)]
    uint256 proof_grand_product_commitment_x;
    uint256 proof_grand_product_commitment_y;
    uint256 proof_grand_product_at_zeta_omega; // z(w*zeta)
    uint256 proof_quotient_polynomial_at_zeta; // t(zeta)
    uint256 proof_linearised_polynomial_at_zeta; // r(zeta)
    // Folded proof for the opening of H, linearised poly, l, r, o, s_1, s_2, qcp
    uint256 proof_batch_opening_at_zeta_x; // [Wzeta]
    uint256 proof_batch_opening_at_zeta_y;
    //Bn254.G1Point opening_at_zeta_omega_proof;      // [Wzeta*omega]
    uint256 proof_opening_at_zeta_omega_x;
    uint256 proof_opening_at_zeta_omega_y;
    uint256 proof_openings_selector_commit_api_at_zeta;
    uint256 proof_selector_commit_api_commitment_x;
    uint256 proof_selector_commit_api_commitment_y;
  }

  function get_proof() internal view returns (bytes memory) {
    Proof memory proof;

    proof.proof_l_com_x = 3744411416677718418718249025975953553145844826632859814634603339807462553534;
    proof.proof_l_com_y = 2002483772756815957015912903441086140018999198892778526965244942134289639218;
    proof.proof_r_com_x = 17170271664910688865526094491499595184555794616133798609912071314418935895341;
    proof.proof_r_com_y = 16301520447309505673124128500991625053582703955956763611801516691949669665097;
    proof.proof_o_com_x = 4825576808590948965745513373961470704512799068446842376925273372384859414068;
    proof.proof_o_com_y = 4531840120427723968486602059109253239818532868980197947154373010619305223741;
    proof.proof_h_0_x = 16448615629060650443333517534393909724140628427800546855176467871089319528054;
    proof.proof_h_0_y = 9593666135206906374733810777363128642334511724596460467905940294498468792378;
    proof.proof_h_1_x = 11415941652140761914282242433054360734936936293084093086854599375713101439762;
    proof.proof_h_1_y = 19518134108913023723777177398661000835575708574453231866849755881442619895919;
    proof.proof_h_2_x = 16204844040413909819168697281594818140475755122355609600008008089839367039280;
    proof.proof_h_2_y = 15234241442081831970720660386386534247775787714615387009463307053386950812729;
    proof.proof_l_at_zeta = 17074062965358468862567917554077364884334843003439220191244394665607443975505;
    proof.proof_r_at_zeta = 14071102587015473963867935668467373717561664420582503096680409156005767583341;
    proof.proof_o_at_zeta = 15238001937141946442140316905180047553455748679003546455752237274931953877532;
    proof.proof_s1_at_zeta = 9539936182520276789829269116724645558200024830729065697579211935000207816460;
    proof.proof_s2_at_zeta = 19178247636566472751145148883334506528769265832114114322608665581126347370030;
    proof
      .proof_grand_product_commitment_x = 4766615987668140859166794700866698091140783551339492934946009214320629464429;
    proof
      .proof_grand_product_commitment_y = 9864550198679392984353203711740624505934442917292901771923620592593537074946;
    proof
      .proof_grand_product_at_zeta_omega = 988145577735546356369565544481381108206418086593338046248955117098652749544;
    proof
      .proof_quotient_polynomial_at_zeta = 16381283550711263028525990236744128256985547581268026415629801560597703420228;
    proof
      .proof_linearised_polynomial_at_zeta = 5305895313715590904290554981195113970992498996488884951757224273192208163501;
    proof.proof_batch_opening_at_zeta_x = 1450918485336591275177565905096666585788210904467762402607446830983679023557;
    proof.proof_batch_opening_at_zeta_y = 17449559573556982607998905245810434471246589036650215511419722672713241839234;
    proof.proof_opening_at_zeta_omega_x = 20884451992705879592969812469963545781308701902951186902866398634897103257980;
    proof.proof_opening_at_zeta_omega_y = 14488625452574321888591272184257848003439682873204582674823785313500952215248;
    proof
      .proof_openings_selector_commit_api_at_zeta = 7646473769094356296017416399592970032698126469362068554089835313188105035500;
    proof
      .proof_selector_commit_api_commitment_x = 2239425368272826282061405534574070761363587835810670164381692126212870760989;
    proof
      .proof_selector_commit_api_commitment_y = 9761541598739196851597518160386258153103789740009906698109345875186292566273;

    bytes memory res;
    res = abi.encodePacked(
      proof.proof_l_com_x,
      proof.proof_l_com_y,
      proof.proof_r_com_x,
      proof.proof_r_com_y,
      proof.proof_o_com_x,
      proof.proof_o_com_y,
      proof.proof_h_0_x,
      proof.proof_h_0_y,
      proof.proof_h_1_x,
      proof.proof_h_1_y,
      proof.proof_h_2_x,
      proof.proof_h_2_y
    );
    res = abi.encodePacked(res, proof.proof_l_at_zeta, proof.proof_r_at_zeta, proof.proof_o_at_zeta);
    res = abi.encodePacked(
      res,
      proof.proof_s1_at_zeta,
      proof.proof_s2_at_zeta,
      proof.proof_grand_product_commitment_x,
      proof.proof_grand_product_commitment_y,
      proof.proof_grand_product_at_zeta_omega,
      proof.proof_quotient_polynomial_at_zeta,
      proof.proof_linearised_polynomial_at_zeta
    );
    res = abi.encodePacked(
      res,
      proof.proof_batch_opening_at_zeta_x,
      proof.proof_batch_opening_at_zeta_y,
      proof.proof_opening_at_zeta_omega_x,
      proof.proof_opening_at_zeta_omega_y,
      proof.proof_openings_selector_commit_api_at_zeta,
      proof.proof_selector_commit_api_commitment_x,
      proof.proof_selector_commit_api_commitment_y
    );

    return res;
  }

  function test_verifier_go(bytes memory proof, uint256[] memory public_inputs) public {
    bool check_proof = this.Verify(proof, public_inputs);
    require(check_proof, "verification failed!");
  }

  function test_verifier() public {
    uint256[] memory pi = new uint256[](1);

    pi[0] = 0;

    bytes memory proof = get_proof();

    bool check_proof = this.Verify(proof, pi);
    emit PrintBool(check_proof);
    require(check_proof, "verification failed!");
  }
}
