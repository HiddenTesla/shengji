package shengji.logic;

import shengji.gui.CardImage;
import shengji.gui.GameFrame;

public class Card {

    public static final int RANK_MAX   = 14;
    public static final int RANK_MIN   = 2;
    public static final int RANK_JACK  = 11;
    public static final int RANK_QUEEN = 12;
    public static final int RANK_KING  = 13;
    public static final int RANK_ACE   = 14;
    public static final int NUM_OF_CARD_SINGLE = 54;
    public static final int NUM_OF_CARD_DUAL   = 108;
    public static final int NUM_OF_CARD_DEALER = 33;
    public static final int NUM_OF_CARD_PLAYER = 25;
    public static final int NUM_OF_SUIT        = 4;
    public static final int NUM_OF_CARD_ONE_SUIT  = 13;
    public static final int CARD_ID_SMALL_JOKER  = 52;
    public static final int CARD_ID_BIG_JOKER    = 53;

    public static GameFrame frame;

    private int idDual;
    private int rank;
    private CardSuit suit;
    private CardImage image;

    public static String rankToLiteral(int rank) {
        if (rank >= 2 && rank <= 10) {
            return String.valueOf(rank);
        }
        switch (rank) {
            case RANK_ACE:
                return "A";
            case RANK_JACK:
                return "J";
            case RANK_QUEEN:
                return "Q";
            case RANK_KING:
                return "K";
            default:
                throw new IllegalArgumentException("Rank " + rank + " out of range");
        }
    }

    public static int dualToSingle(int idDual) {
        if (idDual < 0 || idDual >= NUM_OF_CARD_DUAL) {
            throw new IllegalArgumentException("Card Id " + idDual + " out of range");
        }
        return idDual % NUM_OF_CARD_SINGLE;
    }

    public Card(int idDual) {
        int idSingle = dualToSingle(idDual);
        if (idSingle == CARD_ID_BIG_JOKER) {
            this.suit = CardSuit.BIG_JOKER;
            this.rank = -1;
        }
        else if (idSingle == CARD_ID_SMALL_JOKER) {
            this.suit = CardSuit.SMALL_JOKER;
            this.rank = -1;
        }
        else {
            this.rank = idSingle % NUM_OF_CARD_ONE_SUIT + RANK_MIN;
            int suitOrdinal = idSingle / NUM_OF_CARD_ONE_SUIT;
            switch (suitOrdinal) {
                case 0:
                    this.suit = CardSuit.SPADE;
                    break;
                case 1:
                    this.suit = CardSuit.HEART;
                    break;
                case 2:
                    this.suit = CardSuit.CLUB;
                    break;
                case 3:
                    this.suit = CardSuit.DIAMOND;
                    break;
            }
        }
        String imageFilename = getImageFilename();
        image = new CardImage(frame, imageFilename);
        image.setCard(this);
    }

    public CardImage getImage() {
        return image;
    }

    @Deprecated
    private Card(int rank, CardSuit suit) {
        if (rank > RANK_MAX || rank < RANK_MIN) {
            throw new IllegalArgumentException("Rank " + rank + " out of range");
        }
        this.rank = rank;
        this.suit = suit;
        String imageFilename = getImageFilename();
        image = new CardImage(frame, imageFilename);
    }

    private String getImageFilename() {
        switch (suit) {
            case CLUB: case HEART:
            case SPADE: case DIAMOND:
                return "cards/" + suit.toString().toLowerCase() + "_" + rankToLiteral(rank) + ".png";
            case BIG_JOKER:
                return "cards/big_joker.png";
            case SMALL_JOKER:
                return "cards/small_joker.png";
        }
        // Actually unreachable statement
        throw new RuntimeException();
    }
}
