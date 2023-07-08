

pragma solidity ^0.8.0;
    
import {PlonkVerifierFullLarge} from '../PlonkVerifierFullLarge.sol';


contract TestPlonkVerifierFullLarge is PlonkVerifierFullLarge {

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

        proof.proof_l_com_x = 607781917945928886526259367119809476028331791056719410683398516000046250044;
        proof.proof_l_com_y = 13260782630684994268357661744308305448376736336067448238364976472678382945919;
        proof.proof_r_com_x = 7739956230722681769646143948230008727506497788935864539134966586653926883243;
        proof.proof_r_com_y = 109690564997212154414698332096242190603202908405781984156966646733708314204;
        proof.proof_o_com_x = 4391165748236270012903273677985391498401000173017379426539068577061645124597;
        proof.proof_o_com_y = 4118550174835249681579313972291685436627762398926612002071425184642428341116;
        proof.proof_h_0_x = 19370218574763916173577122465932924819857851390431212737869772968441956627861;
        proof.proof_h_0_y = 7422063587184586411113771671763777667766792822478809934949516140919406576670;
        proof.proof_h_1_x = 19635601234825662918268130548773221635314232913379699458278358671493621992508;
        proof.proof_h_1_y = 1490122911755371565754229415125894660408955248281841635846304863204191603182;
        proof.proof_h_2_x = 18927541466369681474241632007546898404333350990651129468929560629581894240382;
        proof.proof_h_2_y = 452251317676802354095668457537331683577166743990532815051710722284780289267;
        proof.proof_l_at_zeta = 7351878808861716556400588351499601504429961383856796011558191751964389888248;
        proof.proof_r_at_zeta = 20012293796845351557341848598550209253938361682383506048624904684336197191844;
        proof.proof_o_at_zeta = 6846878467082918040893458841918363532408533065573024248308756010592153591747;
        proof.proof_s1_at_zeta = 8295510975191606257825529590164415224457788646957805052949954293726704544961;
        proof.proof_s2_at_zeta = 4002694238460632689429474685591453173445312927568386470017945282089149945918;
        proof.proof_grand_product_commitment_x = 12339872535101791136938473104632960779515307705028256022488658950524364658084;
        proof.proof_grand_product_commitment_y = 13700775298119510228881610779758174609874110072969920663007732337589245836689;
        proof.proof_grand_product_at_zeta_omega = 8086255289888692594582872909191820127599563548142139264417744501084545665361;
        proof.proof_quotient_polynomial_at_zeta = 4063246400405234704251368205327407945392014053144225920715106055218028697468;
        proof.proof_linearised_polynomial_at_zeta = 4883144009090451872852175171081130403531667946283273738781089719918978395498;
        proof.proof_batch_opening_at_zeta_x = 13221618501201889683025195917802272261318687636880493158898430613513358332438;
        proof.proof_batch_opening_at_zeta_y = 13131767872271794631012223204083378857542496109922538194811391964744980675095;
        proof.proof_opening_at_zeta_omega_x = 6324195007584101289871273529717360425564598347452170936746470427167052028840;
		proof.proof_opening_at_zeta_omega_y = 16010241832564237217613635633839414086870300890596043756395217924598731795614;
      
        
        proof.proof_openings_selector_0_commit_api_at_zeta = 2226632238728408853167212228757853488525553436935017312668128210280683473999;
        
        proof.proof_openings_selector_1_commit_api_at_zeta = 16029466795172784635461850337043883795857826046824455184071283358602427409389;
        
        proof.proof_openings_selector_2_commit_api_at_zeta = 20472521693990187275721381445181449751569153360131762205932954989186873200210;
        

        
        proof.proof_selector_0_commit_api_commitment_x = 13861372597617737079461521156181487398794562135510566653835224958464741399174;
        proof.proof_selector_0_commit_api_commitment_y = 13047329560719662287794045802691494204831285096790325140825691905623145430542;
        
        proof.proof_selector_1_commit_api_commitment_x = 14366736071819467637501866926050762561546856106533892750479475015268832616312;
        proof.proof_selector_1_commit_api_commitment_y = 5571985744120853321982505798837005522701853156287851528519071004750645953835;
        
        proof.proof_selector_2_commit_api_commitment_x = 5404140837103247886692393207947357221344818249955296332520663445651808877206;
        proof.proof_selector_2_commit_api_commitment_y = 20606045694255945834048873983840581865287112270551969109076321801842168145823;
        

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

        bool check_proof = PlonkVerifierFullLarge.Verify(proof, pi);
        emit PrintBool(check_proof);
        require(check_proof, "verification failed!");
    }

}
