package shengji.gui.frame;

import shengji.gui.GameFrame;
import shengji.logger.LogFactory;
import org.apache.log4j.Logger;
import shengji.logic.Card;
import shengji.logic.Game;
import shengji.logic.Hand;
import shengji.logic.Player;

public class TestGameFrameWithPlayers {

    private static Logger log = LogFactory.getLog(TestGameFrameWithPlayers.class);

    public static void main(String[] args) {
        Game game = new Game();

        Player south = game.getSouth();
        Player east  = game.getEast();
        Player north = game.getNorth();
        Player west  = game.getWest();
        Player[] players = new Player[] {east, north, west, south};

        int subs = 0;
        Player currentPlayer = players[0];
        int currentCount = 0;
        for (int id = 0; id < Card.NUM_OF_CARD_DUAL; id++) {
            if (currentCount >= Card.NUM_OF_CARD_PLAYER && subs < players.length - 1) {
                subs++;
                currentPlayer = players[subs];
                currentCount = 0;
            }
            currentCount++;
            log.info("Player " + subs + " draws card " + id);
            currentPlayer.drawCard(id);
        }

        for (Player p: players) {
            p.display();
        }
    }
}
