

pragma solidity ^0.8.0;
    
import {PlonkVerifierFull} from '../PlonkVerifierFull.sol';


contract TestPlonkVerifierFull is PlonkVerifierFull {

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

        uint256 proof_grand_product_at_zeta_omega;                    // z(w*zeta)
        uint256 proof_quotient_polynomial_at_zeta;                    // t(zeta)
        uint256 proof_linearised_polynomial_at_zeta;               // r(zeta)

        // Folded proof for the opening of H, linearised poly, l, r, o, s_1, s_2, qcp
        uint256 proof_batch_opening_at_zeta_x;            // [Wzeta]
        uint256 proof_batch_opening_at_zeta_y;

        //Bn254.G1Point opening_at_zeta_omega_proof;      // [Wzeta*omega]
        uint256 proof_opening_at_zeta_omega_x;
        uint256 proof_opening_at_zeta_omega_y;
        
        
        uint256 proof_openings_selector_0_commit_api_at_zeta;
        
        uint256 proof_openings_selector_1_commit_api_at_zeta;
        
        uint256 proof_openings_selector_2_commit_api_at_zeta;
        

        
        uint256 proof_selector_0_commit_api_commitment_x;
        uint256 proof_selector_0_commit_api_commitment_y;
        
        uint256 proof_selector_1_commit_api_commitment_x;
        uint256 proof_selector_1_commit_api_commitment_y;
        
        uint256 proof_selector_2_commit_api_commitment_x;
        uint256 proof_selector_2_commit_api_commitment_y;
        
    }

    function get_proof() internal view
    returns (bytes memory)
    {

        Proof memory proof;

        proof.proof_l_com_x = 14370791478948708230996671497206532965317296540577292437379708930151507850051;
        proof.proof_l_com_y = 21233048496928908565314300078121383327237742687392783028202427738797166922216;
        proof.proof_r_com_x = 1662328256837690443909616048884781654778937302339637250749255654864539383252;
        proof.proof_r_com_y = 21354364561524027122499669401796926019493924516065820173911081488355112997400;
        proof.proof_o_com_x = 16090339007081380804465169190860347077101639039779455639105103190237648247764;
        proof.proof_o_com_y = 3336093929158374792863961186463653698341688748135764308879793017228480478397;
        proof.proof_h_0_x = 11871568993866396131668890967299185966584068268448270575155957622404938298585;
        proof.proof_h_0_y = 11847848503364546472334875592887410372492537903560285999845511078238436704588;
        proof.proof_h_1_x = 16791943244460939471858698477925220714576607455123054588147477742704517002660;
        proof.proof_h_1_y = 3385484399651284875028535865668834587879562524925135123645142011668630146124;
        proof.proof_h_2_x = 12177302703420498115960870059553429525280303230935639325739779310108260003179;
        proof.proof_h_2_y = 18695302508574327351800078733808784557687137257623822746322174932679506855109;
        proof.proof_l_at_zeta = 4241095492836661821730634914367970441046162952294691378724481769763456928207;
        proof.proof_r_at_zeta = 12431598775650311020442149907847072742716211434874794168774629334287949167068;
        proof.proof_o_at_zeta = 7649940130239024093498350481138402763107466687405624701754300424936238736927;
        proof.proof_s1_at_zeta = 1999447771966033217407300772724330213119995206791970737210332879450855988699;
        proof.proof_s2_at_zeta = 12056229522971218163824647363842413674267062253949480075074938840609207677920;
        proof.proof_grand_product_commitment_x = 3395953481071558149243566465005504648840159827107719311673856517374127944211;
        proof.proof_grand_product_commitment_y = 19689411079244405657225849139219281512921385898188902332215142167659765907733;
        proof.proof_grand_product_at_zeta_omega = 1095508791746541708142776156723134373072619267642666577849717104864438169531;
        proof.proof_quotient_polynomial_at_zeta = 20527441796046391833821291852555374397691140250518851906169998997513410177630;
        proof.proof_linearised_polynomial_at_zeta = 9199089760452953531210118875693588355448234404483810764027189524598413557513;
        proof.proof_batch_opening_at_zeta_x = 14295983091719421934629580473347481461084472625715389459267414947037832780610;
        proof.proof_batch_opening_at_zeta_y = 4700451431463025548627692886014221845134549371611795518627052139349748664134;
        proof.proof_opening_at_zeta_omega_x = 10369340156542799701617940979448238842435147693687852781482508993768330362286;
		proof.proof_opening_at_zeta_omega_y = 8262951571601228535582788277403399915466344666182702838692541591517793875081;
      
        
        proof.proof_openings_selector_0_commit_api_at_zeta = 17958748630466027206302642216658363132333053677131252300689633372411486587431;
        
        proof.proof_openings_selector_1_commit_api_at_zeta = 10039881211930507802739016974657019062787497602430233276812557535145663838421;
        
        proof.proof_openings_selector_2_commit_api_at_zeta = 16937432378986683527378951880418492487176733079352666998168841741495027458425;
        

        
        proof.proof_selector_0_commit_api_commitment_x = 17380546829013759484486888179095665048211492732783263791894705906624615917482;
        proof.proof_selector_0_commit_api_commitment_y = 16281699546740356088535535609940765284310756514367553513044704549567887978953;
        
        proof.proof_selector_1_commit_api_commitment_x = 5923932596234777247546083509278902768727955355870968323279152710049073484505;
        proof.proof_selector_1_commit_api_commitment_y = 21638049875536314966336987011847487808349443470210697194073392046029865384789;
        
        proof.proof_selector_2_commit_api_commitment_x = 11421100653311623984572439895205177016229607466926745301943215782008835999525;
        proof.proof_selector_2_commit_api_commitment_y = 11130846030816686812788352016742029266179456400105061405607621157764535180015;
        

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
        res = abi.encodePacked(
            res,
            proof.proof_l_at_zeta,
            proof.proof_r_at_zeta,
            proof.proof_o_at_zeta
        );
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
            proof.proof_opening_at_zeta_omega_y
        );

        
        res = abi.encodePacked(res,proof.proof_openings_selector_0_commit_api_at_zeta);
        
        res = abi.encodePacked(res,proof.proof_openings_selector_1_commit_api_at_zeta);
        
        res = abi.encodePacked(res,proof.proof_openings_selector_2_commit_api_at_zeta);
        

        
        res = abi.encodePacked(res,
            proof.proof_selector_0_commit_api_commitment_x,
            proof.proof_selector_0_commit_api_commitment_y
        );
        
        res = abi.encodePacked(res,
            proof.proof_selector_1_commit_api_commitment_x,
            proof.proof_selector_1_commit_api_commitment_y
        );
        
        res = abi.encodePacked(res,
            proof.proof_selector_2_commit_api_commitment_x,
            proof.proof_selector_2_commit_api_commitment_y
        );
        

        return res;
    }

    function test_verifier() public {

        uint256[] memory pi = new uint256[](1);
        
        pi[0] = 14617277935903348954511872008447373726184388595106564813070133963044622344216;
        

        bytes memory proof = get_proof();

        bool check_proof = PlonkVerifierFull.Verify(proof, pi);
        
        require(check_proof, "verification failed!");
    }

}
